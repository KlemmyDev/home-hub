//! Home Hub: one small service that serves the dashboard and keeps its settings in data/config.json.

mod calendar;
mod dinners;
mod family;
mod holidays;
mod pantry;
mod pocketpals;
mod products;
mod shopping;
mod weather;

use axum::{
    extract::{Query, State},
    http::{header, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use include_dir::{include_dir, Dir};
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

/// The built dashboard (made from ui/ by `bash build-ui.sh`, and kept in git so the hub builds with only Rust).
static WEB: Dir = include_dir!("$CARGO_MANIFEST_DIR/web");
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
    /// Show times like 15:30 instead of 3:30pm.
    #[serde(default)]
    hour24: bool,
    /// The family's time zone, like "Australia/Brisbane". Empty: use the screen's own.
    #[serde(default)]
    timezone: String,
    /// The key from PocketPals' You page (Developers). A secret: never sent back to the screen. It works with the
    /// PocketPals widget's address.
    #[serde(default)]
    pocketpals_key: String,
    /// Whether that key may tick jobs, or only read them.
    #[serde(default)]
    pocketpals_tick: bool,
    /// Where the weather is for: a place's name and rounded coordinates (from the search in Settings). Empty name: no weather.
    #[serde(default)]
    weather_place: String,
    #[serde(default)]
    weather_lat: f64,
    #[serde(default)]
    weather_lon: f64,
    /// Show °F instead of °C.
    #[serde(default)]
    weather_f: bool,
    /// How many minutes before an event the screen warns about it. 0 turns reminders off.
    #[serde(default = "default_remind")]
    remind_min: u32,
    /// Public holidays: a country code like "AU" (empty: none) and an optional region like "AU-QLD".
    #[serde(default)]
    holiday_country: String,
    #[serde(default)]
    holiday_region: String,
    /// The secret in the phone-calendar link. Empty: sharing is off.
    #[serde(default)]
    share_token: String,
}

fn default_remind() -> u32 {
    15
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
    family: RwLock<family::Family>,
    dinners: RwLock<dinners::Dinners>,
    shopping: RwLock<shopping::Shopping>,
    pantry: RwLock<pantry::Pantry>,
    /// The last jobs PocketPals sent, for a few seconds, so a screen asking twice doesn't ask PocketPals twice.
    jobs: Mutex<HashMap<String, (Instant, Value)>>,
    /// The last weather Open-Meteo sent, for ten minutes.
    weather: Mutex<Option<(Instant, Value)>>,
    /// Public holidays by country and year, with when they were fetched (a failed fetch is kept too, so it isn't retried every minute).
    holidays: Mutex<HashMap<(String, i32), (Instant, Vec<holidays::Holiday>)>>,
    /// Names this run of the hub (the version it's on and when it started), so a screen can tell the hub has restarted.
    boot: String,
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
    let family = match tokio::fs::read(data.join("family.json")).await {
        Ok(bytes) => serde_json::from_slice(&bytes).unwrap_or_default(),
        Err(_) => family::Family::default(),
    };
    let dinners = match tokio::fs::read(data.join("dinners.json")).await {
        Ok(bytes) => serde_json::from_slice(&bytes).unwrap_or_default(),
        Err(_) => dinners::Dinners::default(),
    };
    let shopping = match tokio::fs::read(data.join("shopping.json")).await {
        Ok(bytes) => serde_json::from_slice(&bytes).unwrap_or_default(),
        Err(_) => shopping::Shopping::default(),
    };
    let boot = format!("{}-{}", git(&["rev-parse", "HEAD"]).await.map(|s| short(&s)).unwrap_or_default(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0));
    let mut dinners = dinners;
    let pantry = match tokio::fs::read(data.join("pantry.json")).await {
        Ok(bytes) => serde_json::from_slice(&bytes).unwrap_or_default(),
        Err(_) => {
            // First time with the pantry: bring across the simple list the Dinners page used to keep.
            let mut p = pantry::Pantry::default();
            for old in std::mem::take(&mut dinners.pantry) {
                let _ = p.save_item(pantry::Item { name: old.name, qty: if old.low { 0.5 } else { 2.0 }, min: 1.0, auto: false, ..Default::default() });
            }
            if !p.items.is_empty() {
                let _ = write_atomic(&data.join("pantry.json"), &serde_json::to_vec_pretty(&p).unwrap()).await;
                let _ = write_atomic(&data.join("dinners.json"), &serde_json::to_vec_pretty(&dinners).unwrap()).await;
            }
            p
        }
    };
    let app = Arc::new(App { data, config: RwLock::new(config), latest: Mutex::new(None), cals: RwLock::new(HashMap::new()), family: RwLock::new(family), dinners: RwLock::new(dinners), shopping: RwLock::new(shopping), pantry: RwLock::new(pantry), jobs: Mutex::new(HashMap::new()), weather: Mutex::new(None), holidays: Mutex::new(HashMap::new()), boot });

    sync_restock(&app).await;

    // Keep the calendars fresh: once now, then every ten minutes.
    let background = app.clone();
    tokio::spawn(async move {
        loop {
            refresh_calendars(&background).await;
            tokio::time::sleep(CAL_REFRESH).await;
        }
    });

    let router = Router::new()
        .route("/api/state", get(state))
        .route("/api/setup", post(setup))
        .route("/api/calendars", post(save_calendars))
        .route("/api/clock", post(save_clock))
        .route("/api/timezone", post(save_timezone))
        .route("/api/remind", post(save_remind))
        .route("/api/holidays", post(save_holidays))
        .route("/api/share", post(share_change))
        .route("/api/share/{token}", get(share_feed))
        .route("/api/hub-event/restore", post(restore_hub_event))
        .route("/api/events", get(events))
        .route("/api/pocketpals/connect", post(pp_connect))
        .route("/api/pocketpals/disconnect", post(pp_disconnect))
        .route("/api/chores", get(pp_chores))
        .route("/api/chores/tick", post(pp_tick))
        .route("/api/chores/step", post(pp_step))
        .route("/api/shopping", get(get_shopping))
        .route("/api/shopping/add", post(shopping_add))
        .route("/api/shopping/update", post(shopping_update))
        .route("/api/shopping/remove", post(shopping_remove))
        .route("/api/shopping/clear", post(shopping_clear))
        .route("/api/dinners", get(get_dinners))
        .route("/api/meal", post(save_meal))
        .route("/api/meal/delete", post(delete_meal))
        .route("/api/meal/details", post(save_meal_details))
        .route("/api/products/search", get(product_search))
        .route("/api/shopping/add-many", post(shopping_add_many))
        .route("/api/dinner-plan", post(plan_dinner))
        .route("/api/dinner-plan/many", post(plan_many))
        .route("/api/dinner-rule", post(save_rule))
        .route("/api/pantry", get(get_pantry))
        .route("/api/pantry/item", post(pantry_save_item))
        .route("/api/pantry/item/delete", post(pantry_delete_item))
        .route("/api/pantry/adjust", post(pantry_adjust))
        .route("/api/pantry/use", post(pantry_use))
        .route("/api/pantry/stores", post(pantry_stores))
        .route("/api/pantry/settings", post(pantry_settings))
        .route("/api/people", post(save_people))
        .route("/api/hub-event", get(hub_event).post(save_hub_event))
        .route("/api/hub-event/delete", post(delete_hub_event))
        .route("/api/weather", get(get_weather))
        .route("/api/weather/search", get(weather_search))
        .route("/api/weather/set", post(weather_set))
        .route("/api/weather/units", post(weather_units))
        .route("/api/weather/disconnect", post(weather_off))
        .route("/api/status", get(status))
        .route("/api/update", get(update_info))
        .route("/api/update/request", post(update_request))
        .route("/api/pulse", get(pulse))
        .fallback(serve_web)
        .with_state(app);

    let port: u16 = std::env::var("PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(8787);
    let listener = tokio::net::TcpListener::bind(("0.0.0.0", port)).await.expect("can't use that port");
    println!("Home Hub {VERSION} is running on port {port}");
    axum::serve(listener, router).await.expect("server stopped");
}

/// Serves the built dashboard: a file if there is one, otherwise the app's start page (it picks the screen itself).
async fn serve_web(uri: axum::http::Uri) -> impl IntoResponse {
    let path = uri.path().trim_start_matches('/');
    let (file, name) = match WEB.get_file(path) {
        Some(f) if !path.is_empty() => (f, path),
        _ => match WEB.get_file("_shell.html") {
            Some(f) if !path.starts_with("api/") && !path.contains('.') => (f, "_shell.html"),
            _ => return (StatusCode::NOT_FOUND, [(header::CONTENT_TYPE, "text/plain"), (header::CACHE_CONTROL, "no-cache")], b"Not found".as_slice()),
        },
    };
    let kind = match name.rsplit('.').next().unwrap_or("") {
        "html" => "text/html; charset=utf-8",
        "js" => "text/javascript",
        "css" => "text/css",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "webmanifest" => "application/manifest+json",
        "woff2" => "font/woff2",
        _ => "application/octet-stream",
    };
    // File names under assets/ carry a hash of their contents, so they never change; the rest is checked every time.
    let cache = if name.starts_with("assets/") { "public, max-age=31536000, immutable" } else { "no-cache" };
    (StatusCode::OK, [(header::CONTENT_TYPE, kind), (header::CACHE_CONTROL, cache)], file.contents())
}

const WEATHER_CACHE: Duration = Duration::from_secs(600);

/// The weather for the home's place (cached for ten minutes), or `connected: false` when none is chosen.
async fn get_weather(State(app): Shared) -> Json<Value> {
    let c = app.config.read().await.clone();
    if c.weather_place.is_empty() {
        return Json(json!({"connected": false}));
    }
    let mut cache = app.weather.lock().await;
    if let Some((at, v)) = cache.as_ref() {
        if at.elapsed() < WEATHER_CACHE {
            return Json(v.clone());
        }
    }
    match weather::forecast(c.weather_lat, c.weather_lon, c.weather_f).await {
        Ok(mut v) => {
            v["connected"] = json!(true);
            v["place"] = json!(c.weather_place);
            *cache = Some((Instant::now(), v.clone()));
            Json(v)
        }
        // Keep showing the last good weather if the service blips.
        Err(why) => Json(cache.as_ref().map(|(_, v)| v.clone()).unwrap_or_else(|| json!({"connected": true, "place": c.weather_place, "error": why}))),
    }
}

#[derive(Deserialize)]
struct SearchQuery {
    q: String,
}

async fn weather_search(Query(q): Query<SearchQuery>) -> impl IntoResponse {
    match weather::search(&q.q).await {
        Ok(v) => Json(v).into_response(),
        Err(why) => (StatusCode::BAD_REQUEST, why).into_response(),
    }
}

#[derive(Deserialize)]
struct PlaceBody {
    name: String,
    lat: f64,
    lon: f64,
}

async fn weather_set(State(app): Shared, Json(b): Json<PlaceBody>) -> impl IntoResponse {
    let name = b.name.trim().to_string();
    if name.is_empty() || name.len() > 80 || !(-90.0..=90.0).contains(&b.lat) || !(-180.0..=180.0).contains(&b.lon) {
        return (StatusCode::BAD_REQUEST, "Pick a place from the list.").into_response();
    }
    // Only about a kilometre of detail is ever kept or sent.
    let config = Config { weather_place: name, weather_lat: (b.lat * 100.0).round() / 100.0, weather_lon: (b.lon * 100.0).round() / 100.0, ..app.config.read().await.clone() };
    if save(&app, config).await.is_err() {
        return (StatusCode::INTERNAL_SERVER_ERROR, "Couldn't save your settings.").into_response();
    }
    *app.weather.lock().await = None;
    StatusCode::NO_CONTENT.into_response()
}

#[derive(Deserialize)]
struct UnitsBody {
    fahrenheit: bool,
}

async fn weather_units(State(app): Shared, Json(b): Json<UnitsBody>) -> impl IntoResponse {
    let config = Config { weather_f: b.fahrenheit, ..app.config.read().await.clone() };
    if save(&app, config).await.is_err() {
        return (StatusCode::INTERNAL_SERVER_ERROR, "Couldn't save your settings.").into_response();
    }
    *app.weather.lock().await = None;
    StatusCode::NO_CONTENT.into_response()
}

async fn weather_off(State(app): Shared) -> impl IntoResponse {
    let config = Config { weather_place: String::new(), weather_lat: 0.0, weather_lon: 0.0, ..app.config.read().await.clone() };
    if save(&app, config).await.is_err() {
        return (StatusCode::INTERNAL_SERVER_ERROR, "Couldn't save your settings.").into_response();
    }
    *app.weather.lock().await = None;
    StatusCode::NO_CONTENT.into_response()
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
    let people = app.family.read().await.people.clone();
    Json(json!({
        "version": VERSION,
        "people": people,
        "config": {"setup_done": config.setup_done, "name": config.name, "widgets": config.widgets, "calendars": calendars, "hour24": config.hour24, "timezone": config.timezone, "remind_min": config.remind_min, "share": !config.share_token.is_empty(), "holidays": {"country": config.holiday_country, "region": config.holiday_region}, "pocketpals": pocketpals_json(&config), "weather": {"connected": !config.weather_place.is_empty(), "place": config.weather_place, "fahrenheit": config.weather_f}},
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
    let old = app.config.read().await.clone();
    let config = Config { setup_done: true, name, widgets, ..old };
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
struct ClockBody {
    hour24: bool,
}

async fn save_clock(State(app): Shared, Json(body): Json<ClockBody>) -> impl IntoResponse {
    let config = Config { hour24: body.hour24, ..app.config.read().await.clone() };
    if save(&app, config).await.is_err() {
        return (StatusCode::INTERNAL_SERVER_ERROR, "Couldn't save your settings.").into_response();
    }
    StatusCode::NO_CONTENT.into_response()
}

#[derive(Deserialize)]
struct RemindBody {
    minutes: u32,
}

/// How long before an event the screen warns about it (0 for never).
async fn save_remind(State(app): Shared, Json(body): Json<RemindBody>) -> impl IntoResponse {
    if body.minutes > 180 {
        return (StatusCode::BAD_REQUEST, "Up to three hours before, please.").into_response();
    }
    let config = Config { remind_min: body.minutes, ..app.config.read().await.clone() };
    if save(&app, config).await.is_err() {
        return (StatusCode::INTERNAL_SERVER_ERROR, "Couldn't save your settings.").into_response();
    }
    StatusCode::NO_CONTENT.into_response()
}

#[derive(Deserialize)]
struct HolidayBody {
    country: String,
    #[serde(default)]
    region: String,
}

/// Choose which country's public holidays to show (empty for none), and optionally a state or region in it.
async fn save_holidays(State(app): Shared, Json(body): Json<HolidayBody>) -> impl IntoResponse {
    let country = body.country.trim().to_ascii_uppercase();
    let region = body.region.trim().to_ascii_uppercase();
    if !country.is_empty() && !holidays::is_country(&country) {
        return (StatusCode::BAD_REQUEST, "Pick a country from the list.").into_response();
    }
    if !region.is_empty() && (country.is_empty() || !region.starts_with(&format!("{country}-")) || region.len() > 8 || !region.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')) {
        return (StatusCode::BAD_REQUEST, "A region looks like AU-QLD.").into_response();
    }
    let config = Config { holiday_country: country, holiday_region: region, ..app.config.read().await.clone() };
    if save(&app, config).await.is_err() {
        return (StatusCode::INTERNAL_SERVER_ERROR, "Couldn't save your settings.").into_response();
    }
    StatusCode::NO_CONTENT.into_response()
}

#[derive(Deserialize)]
struct ZoneBody {
    timezone: String,
}

/// Set the family's time zone (a name from the tz database), or clear it to follow the screen's own.
async fn save_timezone(State(app): Shared, Json(body): Json<ZoneBody>) -> impl IntoResponse {
    let zone = body.timezone.trim().to_string();
    if !zone.is_empty() && zone.parse::<chrono_tz::Tz>().is_err() {
        return (StatusCode::BAD_REQUEST, "That isn't a time zone we know.").into_response();
    }
    let config = Config { timezone: zone, ..app.config.read().await.clone() };
    if save(&app, config).await.is_err() {
        return (StatusCode::INTERNAL_SERVER_ERROR, "Couldn't save your settings.").into_response();
    }
    StatusCode::NO_CONTENT.into_response()
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
    // Events made on the hub, tagged with who they're for.
    let family = app.family.read().await;
    let made: Vec<(&family::HubEvent, calendar::Event)> = family.events.iter().filter_map(|h| h.to_event().map(|e| (h, e))).collect();
    let engine: Vec<calendar::Event> = made.iter().map(|(_, e)| e.clone()).collect();
    for e in calendar::between(&engine, from, to, "hub") {
        let series = e.id.split(':').nth(1).unwrap_or_default().to_string();
        let Some((h, _)) = made.iter().find(|(h, _)| h.id == series) else { continue };
        let mut v = serde_json::to_value(&e).unwrap_or(Value::Null);
        v["cal"] = json!("hub");
        v["hub"] = json!(true);
        v["series"] = json!(h.id);
        v["people"] = json!(h.people);
        v["repeats"] = json!(h.repeat.freq != "none");
        v["notes"] = json!(h.notes);
        v["link"] = json!(h.link);
        v["travel"] = json!(h.travel);
        v["checklist"] = json!(h.checklist);
        v["icon"] = json!(h.icon);
        v["remind"] = json!(h.remind);
        all.push((e.start.clone(), v));
    }
    // Birthdays, from the family. They show on the person's colour and can't be edited as events (change them in the family list).
    let (day_a, day_b) = (from.date_naive(), to.date_naive());
    for b in family.birthdays(day_a, day_b) {
        let p = &family.people[b.person];
        let title = match b.turns {
            Some(n) => format!("{}'s birthday (turns {n})", p.name),
            None => format!("{}'s birthday", p.name),
        };
        let (start, end) = (b.day.format("%Y-%m-%d").to_string(), (b.day + chrono::Duration::days(1)).format("%Y-%m-%d").to_string());
        all.push((start.clone(), json!({"id": format!("bday:{}:{start}", p.id), "title": title, "location": "", "start": start, "end": end, "all_day": true, "cal": "birthdays", "hub": true, "fixed": true, "people": [p.id]})));
    }
    // Public holidays, once a country is chosen.
    let config = app.config.read().await.clone();
    if !config.holiday_country.is_empty() {
        use chrono::Datelike;
        for year in day_a.year()..=day_b.year() {
            for h in holidays_for(&app, &config.holiday_country, year).await {
                if !holidays::applies(&h, &config.holiday_region) {
                    continue;
                }
                let Some(d) = chrono::NaiveDate::parse_from_str(&h.date, "%Y-%m-%d").ok().filter(|d| *d >= day_a && *d <= day_b) else { continue };
                let end = (d + chrono::Duration::days(1)).format("%Y-%m-%d").to_string();
                all.push((h.date.clone(), json!({"id": format!("holiday:{}", h.date), "title": h.name, "location": "", "start": h.date, "end": end, "all_day": true, "cal": "holidays"})));
            }
        }
        info.push(json!({"id": "holidays", "name": "Public holidays", "color": "#8a93a6", "ok": true}));
    }
    all.sort_by(|a, b| a.0.cmp(&b.0));
    Json(json!({"events": all.into_iter().map(|(_, v)| v).collect::<Vec<_>>(), "calendars": info, "people": family.people})).into_response()
}

/// A year of public holidays: kept for a day (an hour after a failed try).
async fn holidays_for(app: &App, country: &str, year: i32) -> Vec<holidays::Holiday> {
    let key = (country.to_string(), year);
    if let Some((at, list)) = app.holidays.lock().await.get(&key) {
        let keep = if list.is_empty() { Duration::from_secs(3600) } else { Duration::from_secs(86400) };
        if at.elapsed() < keep {
            return list.clone();
        }
    }
    let list = holidays::fetch(country, year).await.unwrap_or_default();
    app.holidays.lock().await.insert(key, (Instant::now(), list.clone()));
    list
}

/// Change a small saved thing (family, dinners, shopping) and save it whole to its file, or say why not.
async fn edit_json<T: Clone + Serialize, R>(lock: &RwLock<T>, file: PathBuf, change: impl FnOnce(&mut T) -> Result<R, &'static str>) -> Result<R, (StatusCode, String)> {
    let mut current = lock.write().await;
    let mut next = current.clone();
    let out = change(&mut next).map_err(|why| (StatusCode::BAD_REQUEST, why.to_string()))?;
    let bytes = serde_json::to_vec_pretty(&next).unwrap();
    write_atomic(&file, &bytes).await.map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "Couldn't save that.".to_string()))?;
    *current = next;
    Ok(out)
}

async fn edit_family<T>(app: &App, change: impl FnOnce(&mut family::Family) -> Result<T, &'static str>) -> Result<T, (StatusCode, String)> {
    edit_json(&app.family, app.data.join("family.json"), change).await
}

async fn edit_dinners<T>(app: &App, change: impl FnOnce(&mut dinners::Dinners) -> Result<T, &'static str>) -> Result<T, (StatusCode, String)> {
    edit_json(&app.dinners, app.data.join("dinners.json"), change).await
}

async fn edit_pantry<T>(app: &App, change: impl FnOnce(&mut pantry::Pantry) -> Result<T, &'static str>) -> Result<T, (StatusCode, String)> {
    edit_json(&app.pantry, app.data.join("pantry.json"), change).await
}

/// Put things on the shopping list that have fallen below their minimum in the pantry (and take them off when they're topped up).
async fn sync_restock(app: &App) {
    let p = app.pantry.read().await.clone();
    let _ = edit_shopping(app, |l| { l.sync_restock(&p); Ok(()) }).await;
}

async fn edit_shopping<T>(app: &App, change: impl FnOnce(&mut shopping::Shopping) -> Result<T, &'static str>) -> Result<T, (StatusCode, String)> {
    edit_json(&app.shopping, app.data.join("shopping.json"), change).await
}

/// The PocketPals link as the screen may see it: whether it's set up, and whether kids can tick. Never the key.
fn pocketpals_json(c: &Config) -> Value {
    let url = pp_url(c);
    json!({"connected": url.is_some() && !c.pocketpals_key.is_empty(), "tick": c.pocketpals_tick, "url": url})
}

fn pp_url(c: &Config) -> Option<String> {
    c.widgets.iter().find(|w| w.id == "pocketpals").map(|w| w.url.clone()).filter(|u| !u.is_empty())
}

#[derive(Deserialize)]
struct ConnectBody {
    url: String,
    key: Option<String>,
}

/// Connect to PocketPals with its address and a key (or keep the key already saved), after checking they work.
async fn pp_connect(State(app): Shared, Json(body): Json<ConnectBody>) -> impl IntoResponse {
    let url = body.url.trim().trim_end_matches('/').to_string();
    if url.len() > 200 || url.contains(char::is_whitespace) || host_port(&url).is_none() {
        return (StatusCode::BAD_REQUEST, "A web address should look like https://pocketpals.example.com or http://192.168.1.20:8080").into_response();
    }
    let old = app.config.read().await.clone();
    let key = body.key.as_deref().map(str::trim).filter(|k| !k.is_empty()).map(str::to_string).unwrap_or_else(|| old.pocketpals_key.clone());
    if !key.starts_with("pp_") || key.len() > 120 || key.contains(char::is_whitespace) {
        return (StatusCode::BAD_REQUEST, "Paste the key from PocketPals (You, then Developers). It starts with pp_").into_response();
    }
    let hello = match pocketpals::ping(&url, &key).await {
        Ok(v) => v,
        Err(why) => return (StatusCode::BAD_REQUEST, why).into_response(),
    };
    let tick = hello["scopes"].as_array().is_some_and(|s| s.iter().any(|x| x == "chores:tick"));
    let mut widgets: Vec<Widget> = old.widgets.iter().filter(|w| w.id != "pocketpals").cloned().collect();
    widgets.insert(0, Widget { id: "pocketpals".into(), url });
    let config = Config { widgets, pocketpals_key: key, pocketpals_tick: tick, ..old };
    if save(&app, config).await.is_err() {
        return (StatusCode::INTERNAL_SERVER_ERROR, "Couldn't save your settings.").into_response();
    }
    app.jobs.lock().await.clear();
    Json(json!({"kids": hello["kids"], "tick": tick})).into_response()
}

async fn pp_disconnect(State(app): Shared) -> impl IntoResponse {
    let config = Config { pocketpals_key: String::new(), pocketpals_tick: false, ..app.config.read().await.clone() };
    if save(&app, config).await.is_err() {
        return (StatusCode::INTERNAL_SERVER_ERROR, "Couldn't save your settings.").into_response();
    }
    app.jobs.lock().await.clear();
    StatusCode::NO_CONTENT.into_response()
}

#[derive(Deserialize)]
struct RangeQuery {
    from: String,
    to: String,
}

const JOBS_FRESH: Duration = Duration::from_secs(8);

/// The kids' jobs from PocketPals for a stretch of days, or why they aren't here.
async fn pp_chores(State(app): Shared, Query(q): Query<RangeQuery>) -> impl IntoResponse {
    let config = app.config.read().await.clone();
    let (Some(url), false) = (pp_url(&config), config.pocketpals_key.is_empty()) else {
        return Json(json!({"connected": false})).into_response();
    };
    if !pocketpals::is_day(&q.from) || !pocketpals::is_day(&q.to) {
        return (StatusCode::BAD_REQUEST, "from and to should be days like 2026-11-02").into_response();
    }
    let cache_key = format!("{}..{}", q.from, q.to);
    if let Some((at, v)) = app.jobs.lock().await.get(&cache_key) {
        if at.elapsed() < JOBS_FRESH {
            return Json(v.clone()).into_response();
        }
    }
    let out = match pocketpals::chores(&url, &config.pocketpals_key, &q.from, &q.to).await {
        Ok(mut v) => {
            v["connected"] = json!(true);
            v["tick"] = json!(config.pocketpals_tick);
            app.jobs.lock().await.insert(cache_key, (Instant::now(), v.clone()));
            v
        }
        Err(why) => json!({"connected": true, "error": why}),
    };
    Json(out).into_response()
}

#[derive(Deserialize)]
struct TickBody {
    kid_id: i64,
    chore_id: i64,
    day: String,
    done: bool,
}

/// Tick a job off in PocketPals (or take the tick back), as the child would.
async fn pp_tick(State(app): Shared, Json(body): Json<TickBody>) -> impl IntoResponse {
    let config = app.config.read().await.clone();
    let (Some(url), false) = (pp_url(&config), config.pocketpals_key.is_empty()) else {
        return (StatusCode::BAD_REQUEST, "PocketPals isn't connected.").into_response();
    };
    if !config.pocketpals_tick {
        return (StatusCode::FORBIDDEN, "This PocketPals key can only show jobs. Make one that can tick them.").into_response();
    }
    if !pocketpals::is_day(&body.day) {
        return (StatusCode::BAD_REQUEST, "That day doesn't look right.").into_response();
    }
    let done = pocketpals::tick(&url, &config.pocketpals_key, body.kid_id, body.chore_id, &body.day, body.done).await;
    app.jobs.lock().await.clear();
    match done {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(why) => (StatusCode::BAD_REQUEST, why).into_response(),
    }
}

#[derive(Deserialize)]
struct StepBody {
    kid_id: i64,
    chore_id: i64,
    step_id: i64,
    day: String,
    done: bool,
}

/// Tick one step of a job in PocketPals (or take it back). The last step ticked marks the job itself.
async fn pp_step(State(app): Shared, Json(body): Json<StepBody>) -> impl IntoResponse {
    let config = app.config.read().await.clone();
    let (Some(url), false) = (pp_url(&config), config.pocketpals_key.is_empty()) else {
        return (StatusCode::BAD_REQUEST, "PocketPals isn't connected.").into_response();
    };
    if !config.pocketpals_tick {
        return (StatusCode::FORBIDDEN, "This PocketPals key can only show jobs. Make one that can tick them.").into_response();
    }
    if !pocketpals::is_day(&body.day) {
        return (StatusCode::BAD_REQUEST, "That day doesn't look right.").into_response();
    }
    let done = pocketpals::tick_step(&url, &config.pocketpals_key, body.kid_id, body.chore_id, body.step_id, &body.day, body.done).await;
    app.jobs.lock().await.clear();
    match done {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(why) => (StatusCode::BAD_REQUEST, why).into_response(),
    }
}

/// The shopping list.
async fn get_shopping(State(app): Shared) -> Json<shopping::Shopping> {
    let mut list = app.shopping.read().await.clone();
    for i in list.items.iter_mut().filter(|i| i.aisle.is_empty()) {
        i.aisle = shopping::aisle_of(&i.name).to_string();      // older items were added before there were aisles
    }
    Json(list)
}

#[derive(Deserialize)]
struct ItemBody {
    name: String,
    #[serde(default)]
    store: String,
    #[serde(default)]
    qty: f64,
}

/// Add something by hand. If the pantry keeps it, it's tied to that pantry item and bought where that item is usually bought.
async fn shopping_add(State(app): Shared, Json(body): Json<ItemBody>) -> impl IntoResponse {
    let p = app.pantry.read().await.clone();
    let hit = p.find("", &body.name);
    let link = shopping::Link { pantry: hit.map(|i| i.id.clone()).unwrap_or_default(), store: if body.store.is_empty() { hit.map(|i| i.store.clone()).unwrap_or_default() } else { body.store.clone() }, qty: if body.qty > 0.0 { body.qty } else { hit.map(|i| i.to_buy().max(0.0)).unwrap_or(0.0) }, unit: hit.map(|i| i.unit.clone()).unwrap_or_default() };
    if !body.store.is_empty() && !p.stores.iter().any(|s| s.id == body.store) {
        return (StatusCode::BAD_REQUEST, "That shop has gone.").into_response();
    }
    match edit_shopping(&app, |l| l.add_linked(&body.name, "", "", "", &link)).await {
        Ok(id) => Json(json!({"id": id})).into_response(),
        Err(e) => e.into_response(),
    }
}

#[derive(Deserialize)]
struct ItemUpdate {
    id: String,
    done: Option<bool>,
    name: Option<String>,
    store: Option<String>,
    qty: Option<f64>,
}

/// Tick something off (or back on), rename it, or change its shop or amount. Ticking off something that tops up a pantry item adds it to the stock.
async fn shopping_update(State(app): Shared, Json(body): Json<ItemUpdate>) -> impl IntoResponse {
    if body.store.as_deref().is_some_and(|s| !s.is_empty() && !app.pantry.try_read().map(|p| p.stores.iter().any(|x| x.id == s)).unwrap_or(true)) {
        return (StatusCode::BAD_REQUEST, "That shop has gone.").into_response();
    }
    let effect = match edit_shopping(&app, |l| {
        l.set(&body.id, None, body.name.as_deref())?;
        l.set_extra(&body.id, body.store.as_deref(), body.qty)?;
        Ok(body.done.and_then(|d| l.tick(&body.id, d)))
    }).await {
        Ok(e) => e,
        Err(e) => return e.into_response(),
    };
    if let Some((id, delta)) = effect {
        let _ = edit_pantry(&app, |p| p.adjust(&id, Some(delta), None).map(|_| ())).await;
        sync_restock(&app).await;
    }
    StatusCode::NO_CONTENT.into_response()
}

async fn shopping_remove(State(app): Shared, Json(body): Json<IdBody>) -> impl IntoResponse {
    match edit_shopping(&app, |l| l.remove(&body.id)).await {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => e.into_response(),
    }
}

/// Take every ticked item off the list.
async fn shopping_clear(State(app): Shared) -> impl IntoResponse {
    match edit_shopping(&app, |l| { l.clear_done(); Ok(()) }).await {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => e.into_response(),
    }
}

/// Every dinner the family knows, and what's planned on which day.
async fn get_dinners(State(app): Shared) -> Json<dinners::Dinners> {
    Json(app.dinners.read().await.clone())
}

#[derive(Deserialize)]
struct MealBody {
    id: Option<String>,
    name: String,
}

#[derive(Deserialize)]
struct MealDetailsBody {
    id: String,
    #[serde(flatten)]
    details: dinners::MealDetails,
}

/// Save a dinner's ingredients, notes and the rest from its own page.
async fn save_meal_details(State(app): Shared, Json(body): Json<MealDetailsBody>) -> impl IntoResponse {
    match edit_dinners(&app, |d| d.set_details(&body.id, body.details)).await {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => e.into_response(),
    }
}

#[derive(Deserialize)]
struct ProductQuery {
    q: String,
}

/// Look up supermarket products (Open Food Facts) by name or barcode.
async fn product_search(Query(q): Query<ProductQuery>) -> impl IntoResponse {
    match products::search(&q.q).await {
        Ok(v) => Json(v).into_response(),
        Err(e) => (StatusCode::BAD_GATEWAY, e).into_response(),
    }
}

#[derive(Deserialize)]
struct ManyItem {
    name: String,
    #[serde(default)]
    note: String,
    #[serde(default)]
    barcode: String,
    /// How much of the pantry item is needed, in the pantry item's unit (worked out on the screen).
    #[serde(default)]
    qty: f64,
}

#[derive(Deserialize)]
struct ManyBody {
    items: Vec<ManyItem>,
    #[serde(default)]
    from: String,
}

/// Put several things on the shopping list at once (a dinner's ingredients), keeping what exactly to get.
async fn shopping_add_many(State(app): Shared, Json(body): Json<ManyBody>) -> impl IntoResponse {
    if body.items.len() > 80 {
        return (StatusCode::BAD_REQUEST, "That's a lot to add at once.").into_response();
    }
    let p = app.pantry.read().await.clone();
    match edit_shopping(&app, |l| {
        for i in &body.items {
            match p.find(&i.barcode, &i.name) {
                Some(hit) => l.add_linked(&i.name, &i.note, &i.barcode, &body.from, &shopping::Link { pantry: hit.id.clone(), store: hit.store.clone(), qty: i.qty.max(0.0), unit: hit.unit.clone() })?,
                None => l.add_for(&i.name, &i.note, &i.barcode, &body.from)?,
            };
        }
        Ok(body.items.len())
    }).await {
        Ok(n) => Json(json!({"added": n})).into_response(),
        Err(e) => e.into_response(),
    }
}

/// The pantry: stock, shops and settings.
async fn get_pantry(State(app): Shared) -> Json<pantry::Pantry> {
    let mut p = app.pantry.read().await.clone();
    for i in &mut p.items {
        i.aisle = shopping::aisle_of(&i.name).to_string();
    }
    Json(p)
}

async fn pantry_save_item(State(app): Shared, Json(body): Json<pantry::Item>) -> impl IntoResponse {
    let r = edit_pantry(&app, |p| p.save_item(body)).await;
    sync_restock(&app).await;
    match r {
        Ok(id) => Json(json!({"id": id})).into_response(),
        Err(e) => e.into_response(),
    }
}

async fn pantry_delete_item(State(app): Shared, Json(body): Json<IdBody>) -> impl IntoResponse {
    let r = edit_pantry(&app, |p| p.remove_item(&body.id)).await;
    sync_restock(&app).await;
    match r {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => e.into_response(),
    }
}

#[derive(Deserialize)]
struct AdjustBody {
    id: String,
    delta: Option<f64>,
    set: Option<f64>,
}

/// Change how much of something there is: add or take away an amount, or set it.
async fn pantry_adjust(State(app): Shared, Json(body): Json<AdjustBody>) -> impl IntoResponse {
    let r = edit_pantry(&app, |p| p.adjust(&body.id, body.delta, body.set)).await;
    sync_restock(&app).await;
    match r {
        Ok(q) => Json(json!({"qty": q})).into_response(),
        Err(e) => e.into_response(),
    }
}

#[derive(Deserialize)]
struct UseOne {
    id: String,
    delta: f64,
}

#[derive(Deserialize)]
struct UseBody {
    uses: Vec<UseOne>,
}

/// Take what a dinner used off the stock (or put it back, with positive amounts).
async fn pantry_use(State(app): Shared, Json(body): Json<UseBody>) -> impl IntoResponse {
    let uses: Vec<(String, f64)> = body.uses.into_iter().map(|u| (u.id, u.delta)).collect();
    let r = edit_pantry(&app, |p| p.use_many(&uses)).await;
    sync_restock(&app).await;
    match r {
        Ok(n) => Json(json!({"changed": n})).into_response(),
        Err(e) => e.into_response(),
    }
}

/// Replace the list of shops. Items and shopping list entries for a shop that's gone fall back to "anywhere".
async fn pantry_stores(State(app): Shared, Json(body): Json<Vec<pantry::Store>>) -> impl IntoResponse {
    let r = edit_pantry(&app, |p| p.set_stores(body)).await;
    if r.is_ok() {
        let ids: Vec<String> = app.pantry.read().await.stores.iter().map(|s| s.id.clone()).collect();
        let _ = edit_shopping(&app, |l| { l.items.iter_mut().filter(|i| !ids.contains(&i.store)).for_each(|i| i.store.clear()); Ok(()) }).await;
    }
    sync_restock(&app).await;
    match r {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => e.into_response(),
    }
}

async fn pantry_settings(State(app): Shared, Json(body): Json<pantry::Settings>) -> impl IntoResponse {
    let r = edit_pantry(&app, |p| { p.settings = body; Ok(()) }).await;
    sync_restock(&app).await;
    match r {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => e.into_response(),
    }
}

/// Add a dinner, or rename one.
async fn save_meal(State(app): Shared, Json(body): Json<MealBody>) -> impl IntoResponse {
    match edit_dinners(&app, |d| d.save_meal(body.id.as_deref(), &body.name)).await {
        Ok(id) => Json(json!({"id": id})).into_response(),
        Err(e) => e.into_response(),
    }
}

#[derive(Deserialize)]
struct IdBody {
    id: String,
}

async fn delete_meal(State(app): Shared, Json(body): Json<IdBody>) -> impl IntoResponse {
    match edit_dinners(&app, |d| d.remove_meal(&body.id)).await {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => e.into_response(),
    }
}

#[derive(Deserialize)]
struct PlanBody {
    date: String,
    meal_id: Option<String>,
    #[serde(flatten)]
    extra: dinners::PlanExtra,
    /// A dinner by name; if it's new it's added to the list.
    name: Option<String>,
    cook: Option<String>,
}

/// Plan a dinner for a day (or clear the day when no dinner is given).
async fn plan_dinner(State(app): Shared, Json(body): Json<PlanBody>) -> impl IntoResponse {
    let people = app.family.read().await.people.clone();
    match edit_dinners(&app, |d| d.set_plan(&body.date, body.meal_id.as_deref(), body.name.as_deref(), body.cook.as_deref(), &people, body.extra)).await {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => e.into_response(),
    }
}

#[derive(Deserialize)]
struct Night {
    date: String,
    #[serde(default)]
    meal_id: String,
    #[serde(default)]
    kind: String,
}

/// Plan several nights at once; nights that already have something are left alone.
async fn plan_many(State(app): Shared, Json(body): Json<Vec<Night>>) -> impl IntoResponse {
    let nights: Vec<(String, String, String)> = body.into_iter().map(|n| (n.date, n.meal_id, n.kind)).collect();
    match edit_dinners(&app, |d| d.plan_many(&nights)).await {
        Ok(n) => Json(json!({"added": n})).into_response(),
        Err(e) => e.into_response(),
    }
}

#[derive(Deserialize)]
struct RuleBody {
    weekday: u8,
    meal: Option<String>,
    kind: Option<String>,
}

/// Say what a weekday usually is, or clear it.
async fn save_rule(State(app): Shared, Json(body): Json<RuleBody>) -> impl IntoResponse {
    let rule = dinners::Rule { meal: body.meal.unwrap_or_default(), kind: body.kind.unwrap_or_default() };
    match edit_dinners(&app, |d| d.set_rule(body.weekday, Some(rule))).await {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => e.into_response(),
    }
}

/// Replace the list of family members.
async fn save_people(State(app): Shared, Json(body): Json<Vec<family::PersonIn>>) -> impl IntoResponse {
    match edit_family(&app, |f| f.set_people(body)).await {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => e.into_response(),
    }
}

#[derive(Deserialize)]
struct IdQuery {
    id: String,
}

/// One hub event as it was made (its repeat rule and people), for editing.
async fn hub_event(State(app): Shared, Query(q): Query<IdQuery>) -> impl IntoResponse {
    match app.family.read().await.events.iter().find(|e| e.id == q.id) {
        Some(e) => Json(e.clone()).into_response(),
        None => (StatusCode::NOT_FOUND, "That event has gone already.").into_response(),
    }
}

/// Add an event, or change one that has an id.
async fn save_hub_event(State(app): Shared, Json(body): Json<family::HubEvent>) -> impl IntoResponse {
    match edit_family(&app, |f| f.save_event(body)).await {
        Ok(id) => Json(json!({"id": id})).into_response(),
        Err(e) => e.into_response(),
    }
}

/// Put a deleted event back as it was.
async fn restore_hub_event(State(app): Shared, Json(body): Json<family::HubEvent>) -> impl IntoResponse {
    match edit_family(&app, |f| f.restore_event(body)).await {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => e.into_response(),
    }
}

#[derive(Deserialize)]
struct ShareBody {
    on: bool,
}

/// A fresh random secret from the system, as 32 letters and numbers.
fn new_secret() -> Option<String> {
    use std::io::Read;
    let mut b = [0u8; 16];
    std::fs::File::open("/dev/urandom").ok()?.read_exact(&mut b).ok()?;
    Some(b.iter().map(|x| format!("{x:02x}")).collect())
}

/// Turn the phone-calendar link on (or make a new one, which stops the old one working) or off. Returns the secret once, for the link.
async fn share_change(State(app): Shared, Json(body): Json<ShareBody>) -> impl IntoResponse {
    let token = if body.on { new_secret() } else { Some(String::new()) };
    let Some(token) = token else { return (StatusCode::INTERNAL_SERVER_ERROR, "Couldn't make a secret link on this machine.").into_response() };
    let config = Config { share_token: token.clone(), ..app.config.read().await.clone() };
    if save(&app, config).await.is_err() {
        return (StatusCode::INTERNAL_SERVER_ERROR, "Couldn't save your settings.").into_response();
    }
    Json(json!({"token": token})).into_response()
}

/// The hub's own events and birthdays as an iCal feed, for a phone to follow. Read only, and only with the secret.
async fn share_feed(State(app): Shared, axum::extract::Path(token): axum::extract::Path<String>) -> impl IntoResponse {
    let want = app.config.read().await.share_token.clone();
    if want.is_empty() || token.trim_end_matches(".ics") != want {
        return StatusCode::NOT_FOUND.into_response();
    }
    ([(axum::http::header::CONTENT_TYPE, "text/calendar; charset=utf-8")], app.family.read().await.to_ics()).into_response()
}

#[derive(Deserialize)]
struct DeleteBody {
    id: String,
    /// For a repeating event: just the one starting then (like 2026-11-04T16:00:00).
    only: Option<String>,
}

async fn delete_hub_event(State(app): Shared, Json(body): Json<DeleteBody>) -> impl IntoResponse {
    match edit_family(&app, |f| f.remove_event(&body.id, body.only.as_deref())).await {
        Ok(()) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => e.into_response(),
    }
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

/// A small, cheap answer every screen asks for every few seconds: which run of the hub this is, and how an update is going
/// (what the updater last wrote), so every screen can show it and reload itself when the hub comes back on the new version.
async fn pulse(State(app): Shared) -> impl IntoResponse {
    let read = |name: &str| std::fs::read(app.data.join("update").join(name)).ok().and_then(|b| serde_json::from_slice::<Value>(&b).ok());
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    ([(axum::http::header::CACHE_CONTROL, "no-store")], Json(json!({
        "boot": app.boot,
        "now": now,
        "status": read("status.json"),
        "requested": app.data.join("update/request").exists(),
        "took": read("last.json").and_then(|v| v["took"].as_u64()),
    })))
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
