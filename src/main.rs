//! Home Hub: one small service that serves the dashboard and keeps its settings in data/config.json.

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

#[derive(Serialize, Deserialize, Clone, Default)]
struct Config {
    setup_done: bool,
    name: String,
    widgets: Vec<Widget>,
}

struct App {
    data: PathBuf,
    config: RwLock<Config>,
    latest: Mutex<Option<(Instant, Option<String>)>>,
}

type Shared = State<Arc<App>>;

#[tokio::main]
async fn main() {
    let data = PathBuf::from("data");
    tokio::fs::create_dir_all(data.join("update")).await.expect("can't create data/");
    let config = match tokio::fs::read(data.join("config.json")).await {
        Ok(bytes) => serde_json::from_slice(&bytes).unwrap_or_default(),
        Err(_) => Config::default(),
    };
    let app = Arc::new(App { data, config: RwLock::new(config), latest: Mutex::new(None) });

    let router = Router::new()
        .route("/", get(|| async { ([(header::CACHE_CONTROL, "no-cache")], Html(INDEX)) }))
        .route("/api/state", get(state))
        .route("/api/setup", post(setup))
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
    Json(json!({"version": VERSION, "config": config, "catalog": catalog_json()}))
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
    let config = Config { setup_done: true, name, widgets };
    if write_atomic(&app.data.join("config.json"), &serde_json::to_vec_pretty(&config).unwrap()).await.is_err() {
        return (StatusCode::INTERNAL_SERVER_ERROR, "Couldn't save your settings.").into_response();
    }
    *app.config.write().await = config;
    StatusCode::NO_CONTENT.into_response()
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
