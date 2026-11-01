//! Home Hub: one small service that serves the dashboard and keeps its settings in data/config.json.

mod calendar;

use axum::{
    extract::{Query, State},
    http::{header, StatusCode},
    response::{Html, IntoResponse},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::{
    net::TcpStream,
    process::Command,
    sync::{Mutex, RwLock},
    time::timeout,
};

const INDEX: &str = include_str!("../web/index.html");
const VERSION: &str = env!("CARGO_PKG_VERSION");
const LATEST_CACHE: Duration = Duration::from_secs(300);

/// The widgets a family can add: (id, name, what it is).
const CATALOG: &[(&str, &str, &str)] = &[
    ("pocketpals", "PocketPals", "Chores and pocket money"),
    ("wattsmypower", "WattsMyPower", "How much power the house is using"),
];

#[derive(Serialize, Deserialize, Clone, Default)]
struct Widget {
    id: String,
    url: String,
}

/// A calendar the family follows, by the private iCal address its owner copied from Google, Apple or Outlook.
/// The address is a secret, so it lives only in data/config.json and is never sent back to the screen.
#[derive(Serialize, Deserialize, Clone, Default)]
struct Cal {
    id: String,
    name: String,
    url: String,
    color: String,
}

#[derive(Serialize, Deserialize, Clone, Default)]
struct Config {
    setup_done: bool,
    name: String,
    widgets: Vec<Widget>,
    #[serde(default)]
    calendars: Vec<Cal>,
}

/// What the last fetch of one calendar found.
#[derive(Default)]
struct CalState {
    events: Vec<calendar::Event>,
    error: Option<String>,
    loaded: bool,
}

struct App {
    data: PathBuf,
    config: RwLock<Config>,
    latest: Mutex<Option<(Instant, Option<String>)>>,
    cals: RwLock<HashMap<String, CalState>>,
}

const MAX_CALENDARS: usize = 8;
const CAL_REFRESH: Duration = Duration::from_secs(600);

type Shared = State<Arc<App>>;

#[tokio::main]
async fn main() {
    let data = PathBuf::from("data");
    tokio::fs::create_dir_all(data.join("update")).await.expect("can't create data/");
    let config = match tokio::fs::read(data.join("config.json")).await {
        Ok(bytes) => serde_json::from_slice(&bytes).unwrap_or_default(),
        Err(_) => Config::default(),
    };
    let app = Arc::new(App { data, config: RwLock::new(config), latest: Mutex::new(None), cals: RwLock::new(HashMap::new()) });

    // Keep the calendars fresh: once now, then every ten minutes.
    let background = app.clone();
    tokio::spawn(async move {
        loop {
            refresh_calendars(&background).await;
            tokio::time::sleep(CAL_REFRESH).await;
        }
    });

    let router = Router::new()
        .route("/", get(|| async { ([(header::CACHE_CONTROL, "no-cache")], Html(INDEX)) }))
        .route("/api/state", get(state))
        .route("/api/setup", post(setup))
        .route("/api/calendars", post(save_calendars))
        .route("/api/events", get(events))
        .route("/api/status", get(status))
        .route("/api/update", get(update_info))
        .route("/api/update/request", post(update_request))
        .with_state(app);

    let port: u16 = std::env::var("PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(8787);
    let listener = tokio::net::TcpListener::bind(("0.0.0.0", port)).await.expect("can't use that port");
    println!("Home Hub {VERSION} is running on port {port}");
    axum::serve(listener, router).await.expect("server stopped");
}

fn catalog_json() -> Value {
    CATALOG.iter().map(|(id, name, about)| json!({"id": id, "name": name, "about": about})).collect()
}

async fn state(State(app): Shared) -> Json<Value> {
    let config = app.config.read().await.clone();
    // The calendar addresses are secrets: send only a name, a colour and the site they come from.
    let calendars: Vec<Value> = config
        .calendars
        .iter()
        .map(|c| json!({"id": c.id, "name": c.name, "color": c.color, "site": host_port(&c.url.replacen("webcal://", "https://", 1)).map(|h| h.0)}))
        .collect();
    Json(json!({
        "version": VERSION,
        "config": {"setup_done": config.setup_done, "name": config.name, "widgets": config.widgets, "calendars": calendars},
        "catalog": catalog_json(),
    }))
}

#[derive(Deserialize)]
struct SetupBody {
    name: String,
    widgets: Vec<Widget>,
}

async fn setup(State(app): Shared, Json(body): Json<SetupBody>) -> impl IntoResponse {
    let name = body.name.trim().to_string();
    if name.is_empty() || name.chars().count() > 40 {
        return (StatusCode::BAD_REQUEST, "Please give your home a name (up to 40 letters).").into_response();
    }
    let mut widgets: Vec<Widget> = Vec::new();
    for w in body.widgets {
        let url = w.url.trim().trim_end_matches('/').to_string();
        if !CATALOG.iter().any(|(id, ..)| *id == w.id) || widgets.iter().any(|x| x.id == w.id) {
            return (StatusCode::BAD_REQUEST, "That widget isn't one we know.").into_response();
        }
        if url.len() > 200 || url.contains(char::is_whitespace) || host_port(&url).is_none() {
            return (StatusCode::BAD_REQUEST, "A web address should look like http://192.168.1.20:8080").into_response();
        }
        widgets.push(Widget { id: w.id, url });
    }
    let calendars = app.config.read().await.calendars.clone();
    let config = Config { setup_done: true, name, widgets, calendars };
    if save(&app, config).await.is_err() {
        return (StatusCode::INTERNAL_SERVER_ERROR, "Couldn't save your settings.").into_response();
    }
    StatusCode::NO_CONTENT.into_response()
}

async fn save(app: &App, config: Config) -> std::io::Result<()> {
    write_atomic(&app.data.join("config.json"), &serde_json::to_vec_pretty(&config).unwrap()).await?;
    *app.config.write().await = config;
    Ok(())
}

#[derive(Deserialize)]
struct CalBody {
    id: Option<String>,
    name: String,
    /// Left empty when keeping an existing calendar's address.
    url: Option<String>,
    color: String,
}

/// Replace the list of calendars. An entry with an id and no address keeps the address it had.
async fn save_calendars(State(app): Shared, Json(body): Json<Vec<CalBody>>) -> impl IntoResponse {
    if body.len() > MAX_CALENDARS {
        return (StatusCode::BAD_REQUEST, format!("Up to {MAX_CALENDARS} calendars, please.")).into_response();
    }
    let old = app.config.read().await.clone();
    let mut calendars: Vec<Cal> = Vec::new();
    for (i, b) in body.into_iter().enumerate() {
        let name = b.name.trim().to_string();
        if name.is_empty() || name.chars().count() > 30 {
            return (StatusCode::BAD_REQUEST, "Give each calendar a name (up to 30 letters).").into_response();
        }
        let ok_color = b.color.len() == 7 && b.color.starts_with('#') && b.color[1..].chars().all(|c| c.is_ascii_hexdigit());
        if !ok_color {
            return (StatusCode::BAD_REQUEST, "That colour isn't one we know.").into_response();
        }
        let kept = b.id.as_ref().and_then(|id| old.calendars.iter().find(|c| &c.id == id));
        let url = match b.url.as_deref().map(str::trim).filter(|u| !u.is_empty()) {
            Some(u) => u.to_string(),
            None => match kept {
                Some(c) => c.url.clone(),
                None => return (StatusCode::BAD_REQUEST, "Paste the calendar's iCal address.").into_response(),
            },
        };
        let web = url.replacen("webcal://", "https://", 1);
        if url.len() > 600 || url.contains(char::is_whitespace) || host_port(&web).is_none() {
            return (StatusCode::BAD_REQUEST, "That doesn't look like a calendar address. It should start with https:// or webcal://").into_response();
        }
        let id = kept.map(|c| c.id.clone()).unwrap_or_else(|| {
            let t = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
            format!("c{t}x{i}")
        });
        calendars.push(Cal { id, name, url, color: b.color });
    }
    let config = Config { calendars, ..old };
    if save(&app, config).await.is_err() {
        return (StatusCode::INTERNAL_SERVER_ERROR, "Couldn't save your calendars.").into_response();
    }
    let background = app.clone();
    tokio::spawn(async move { refresh_calendars(&background).await });
    StatusCode::NO_CONTENT.into_response()
}

/// Fetch every calendar at once and remember what each said.
async fn refresh_calendars(app: &Arc<App>) {
    let cals = app.config.read().await.calendars.clone();
    let fetched = futures_join(cals.iter().cloned().map(|c| async move {
        let result = calendar::fetch(&c.url).await.map(|text| calendar::parse(&text));
        (c.id, result)
    }))
    .await;
    let mut map = app.cals.write().await;
    map.retain(|id, _| cals.iter().any(|c| &c.id == id));
    for (id, result) in fetched {
        let entry = map.entry(id).or_default();
        match result {
            Ok(events) => *entry = CalState { events, error: None, loaded: true },
            // Keep the last good events if a fetch fails.
            Err(why) => {
                entry.error = Some(why);
                entry.loaded = true;
            }
        }
    }
}

#[derive(Deserialize)]
struct EventsQuery {
    from: String,
    to: String,
}

/// Events between two moments (RFC 3339), from every calendar, in time order, tagged with their calendar.
async fn events(State(app): Shared, Query(q): Query<EventsQuery>) -> impl IntoResponse {
    let parse = |s: &str| chrono::DateTime::parse_from_rfc3339(s).ok().map(|d| d.with_timezone(&chrono::Utc));
    let (Some(from), Some(to)) = (parse(&q.from), parse(&q.to)) else {
        return (StatusCode::BAD_REQUEST, "from and to should be like 2026-11-02T00:00:00Z").into_response();
    };
    if to <= from || to - from > chrono::Duration::days(100) {
        return (StatusCode::BAD_REQUEST, "Ask for up to about three months at a time.").into_response();
    }
    let cals = app.config.read().await.calendars.clone();
    let states = app.cals.read().await;
    let mut all: Vec<(String, Value)> = Vec::new();
    let mut info: Vec<Value> = Vec::new();
    for c in &cals {
        let st = states.get(&c.id);
        info.push(json!({"id": c.id, "name": c.name, "color": c.color, "ok": st.is_some_and(|s| s.loaded && s.error.is_none()), "error": st.and_then(|s| s.error.clone())}));
        if let Some(st) = st {
            for e in calendar::between(&st.events, from, to, &c.id) {
                let mut v = serde_json::to_value(&e).unwrap_or(Value::Null);
                v["cal"] = json!(c.id);
                all.push((e.start.clone(), v));
            }
        }
    }
    all.sort_by(|a, b| a.0.cmp(&b.0));
    Json(json!({"events": all.into_iter().map(|(_, v)| v).collect::<Vec<_>>(), "calendars": info})).into_response()
}

/// Is each widget's app answering? A quick connection to its address; nothing is fetched.
async fn status(State(app): Shared) -> Json<Value> {
    let widgets = app.config.read().await.widgets.clone();
    let checks = widgets.into_iter().map(|w| async move {
        let up = match host_port(&w.url) {
            Some(hp) => matches!(timeout(Duration::from_secs(2), TcpStream::connect(hp)).await, Ok(Ok(_))),
            None => false,
        };
        (w.id, up)
    });
    let results = futures_join(checks).await;
    Json(results.into_iter().map(|(id, up)| (id, Value::Bool(up))).collect::<serde_json::Map<_, _>>().into())
}

#[derive(Deserialize)]
struct UpdateQuery {
    fresh: Option<u8>,
}

/// Where the hub is, where GitHub is, and what the updater (updater.sh) last said.
async fn update_info(State(app): Shared, Query(q): Query<UpdateQuery>) -> Json<Value> {
    let current = git(&["rev-parse", "HEAD"]).await.map(|s| short(&s));
    let latest = {
        let mut cache = app.latest.lock().await;
        let stale = cache.as_ref().is_none_or(|(at, _)| at.elapsed() > LATEST_CACHE);
        if stale || q.fresh == Some(1) {
            let found = git(&["ls-remote", "origin", "refs/heads/main"])
                .await
                .and_then(|s| s.split_whitespace().next().map(short));
            *cache = Some((Instant::now(), found));
        }
        cache.as_ref().and_then(|(_, l)| l.clone())
    };
    let read = |name: &str| std::fs::read(app.data.join("update").join(name)).ok().and_then(|b| serde_json::from_slice::<Value>(&b).ok());
    Json(json!({
        "version": VERSION,
        "current": current,
        "latest": latest,
        "available": matches!((&current, &latest), (Some(c), Some(l)) if c != l),
        "updater": read("updater.json"),
        "status": read("status.json"),
        "requested": app.data.join("update/request").exists(),
    }))
}

/// The hub can only ask: updater.sh (run every minute by cron) sees the note and runs install.sh.
async fn update_request(State(app): Shared) -> StatusCode {
    match tokio::fs::write(app.data.join("update/request"), b"").await {
        Ok(_) => StatusCode::NO_CONTENT,
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR,
    }
}

fn short(sha: &str) -> String {
    sha.trim().chars().take(7).collect()
}

async fn git(args: &[&str]) -> Option<String> {
    let run = Command::new("git").args(args).env("GIT_TERMINAL_PROMPT", "0").kill_on_drop(true).output();
    let out = timeout(Duration::from_secs(10), run).await.ok()?.ok()?;
    out.status.success().then(|| String::from_utf8_lossy(&out.stdout).trim().to_string())
}

/// Write a file whole, so a reader never sees half of one.
async fn write_atomic(path: &std::path::Path, bytes: &[u8]) -> std::io::Result<()> {
    let tmp = path.with_extension("tmp");
    tokio::fs::write(&tmp, bytes).await?;
    tokio::fs::rename(&tmp, path).await
}

/// Host and port from an http(s) address, or None if it isn't one.
fn host_port(url: &str) -> Option<(String, u16)> {
    let (scheme, rest) = url.split_once("://")?;
    let default = match scheme {
        "http" => 80,
        "https" => 443,
        _ => return None,
    };
    let auth = rest.split(['/', '?', '#']).next()?.rsplit('@').next()?;
    if auth.is_empty() {
        return None;
    }
    if let Some(v6) = auth.strip_prefix('[') {
        let (host, after) = v6.split_once(']')?;
        let port = match after.strip_prefix(':') {
            Some(p) => p.parse().ok()?,
            None => default,
        };
        return Some((host.to_string(), port));
    }
    match auth.rsplit_once(':') {
        Some((host, port)) if !host.is_empty() => Some((host.to_string(), port.parse().ok()?)),
        Some(_) => None,
        None => Some((auth.to_string(), default)),
    }
}

/// Run futures at the same time and collect their results (no extra crate needed for a handful).
async fn futures_join<T, F>(futs: impl IntoIterator<Item = F>) -> Vec<T>
where
    F: std::future::Future<Output = T> + Send + 'static,
    T: Send + 'static,
{
    let handles: Vec<_> = futs.into_iter().map(tokio::spawn).collect();
    let mut out = Vec::with_capacity(handles.len());
    for h in handles {
        if let Ok(v) = h.await {
            out.push(v);
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::host_port;

    #[test]
    fn parses_addresses() {
        assert_eq!(host_port("http://192.168.1.20:8080"), Some(("192.168.1.20".into(), 8080)));
        assert_eq!(host_port("https://pp.home/app"), Some(("pp.home".into(), 443)));
        assert_eq!(host_port("http://[::1]:9000/x"), Some(("::1".into(), 9000)));
        assert_eq!(host_port("ftp://x"), None);
        assert_eq!(host_port("http://"), None);
        assert_eq!(host_port("http://host:abc"), None);
    }
}
