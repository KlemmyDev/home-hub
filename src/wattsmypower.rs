//! WattsMyPower: read the house's energy through WattsMyPower's read-only API, using a key made on its Settings page
//! (Developers). The key lives only in data/config.json and is never sent back to the screen; it goes to curl through stdin.

use serde_json::Value;
use std::{process::Stdio, time::Duration};
use tokio::{io::AsyncWriteExt, process::Command, time::timeout};

pub struct Reply {
    pub status: u16,
    pub body: String,
}

async fn get(base: &str, path: &str, key: &str) -> Result<Reply, String> {
    let url = format!("{}{}", base.trim_end_matches('/'), path);
    let mut child = Command::new("curl")
        .args(["-sS", "--max-time", "15", "--max-filesize", "8000000", "--proto", "=http,https", "-w", "\n%{http_code}", "-K", "-", "--", &url])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|_| "Couldn't reach WattsMyPower from this machine.".to_string())?;
    let config = format!("header = \"Authorization: Bearer {}\"\nheader = \"Accept: application/json\"\n", key.replace(['"', '\\', '\n', '\r'], ""));
    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(config.as_bytes()).await;
    }
    let out = timeout(Duration::from_secs(20), child.wait_with_output())
        .await
        .map_err(|_| "WattsMyPower took too long to answer.".to_string())?
        .map_err(|_| "Couldn't reach WattsMyPower from this machine.".to_string())?;
    if !out.status.success() {
        return Err("Can't reach WattsMyPower. Check its address.".into());
    }
    let text = String::from_utf8_lossy(&out.stdout).into_owned();
    let (body, code) = text.rsplit_once('\n').unwrap_or(("", "0"));
    Ok(Reply { status: code.trim().parse().unwrap_or(0), body: body.to_string() })
}

fn why(r: &Reply) -> String {
    let said = serde_json::from_str::<Value>(&r.body).ok().and_then(|v| v["detail"].as_str().map(str::to_string));
    match (r.status, said) {
        (401, _) => "WattsMyPower doesn't recognise that key. It may have been removed.".into(),
        (403, Some(m)) | (_, Some(m)) => m,
        (0, _) => "WattsMyPower didn't answer.".into(),
        (404, None) => "That address doesn't look like a WattsMyPower that has API keys. Update WattsMyPower first.".into(),
        (s, None) => format!("WattsMyPower said no ({s})."),
    }
}

/// Is this address and key a WattsMyPower that will talk to us? Returns what it says about the key.
pub async fn ping(base: &str, key: &str) -> Result<Value, String> {
    let r = get(base, "/api/v1/ping", key).await?;
    if r.status != 200 {
        return Err(why(&r));
    }
    serde_json::from_str(&r.body).map_err(|_| "That address isn't WattsMyPower.".to_string())
}

/// What the screen may ask for, and the permission each needs (the reading is only worth asking for if the key has it).
pub const READS: [(&str, &str); 9] = [
    ("live", "live:read"), ("today", "live:read"), ("history", "history:read"), ("daily", "history:read"), ("costs", "costs:read"),
    ("tariff", "costs:read"), ("savings", "costs:read"), ("forecast", "forecast:read"), ("insights", "insights:read"),
];

/// A reading, with the few numbers that may be asked for it (unix seconds, or how many points).
pub async fn read(base: &str, key: &str, what: &str, params: &[(&str, i64)]) -> Result<Value, String> {
    let mut path = format!("/api/v1/{what}");
    for (i, (k, v)) in params.iter().enumerate() {
        path.push(if i == 0 { '?' } else { '&' });
        path.push_str(&format!("{k}={v}"));
    }
    let r = get(base, &path, key).await?;
    if r.status != 200 {
        return Err(why(&r));
    }
    serde_json::from_str(&r.body).map_err(|_| "WattsMyPower sent something we couldn't read.".to_string())
}
