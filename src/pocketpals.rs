//! PocketPals: read the kids' jobs and tick them off through PocketPals' API, using a key made on its You page
//! (Developers). The address and the key are secrets of the family's network: the key lives only in data/config.json
//! and is never sent back to the screen.

use serde_json::Value;
use std::{process::Stdio, time::Duration};
use tokio::{io::AsyncWriteExt, process::Command, time::timeout};

/// One answer from PocketPals: its status and what it said.
pub struct Reply {
    pub status: u16,
    pub body: String,
}

/// Ask PocketPals something. The key goes in through curl's stdin, so it never shows in the machine's process list.
async fn request(method: &str, base: &str, path: &str, key: &str) -> Result<Reply, String> {
    let url = format!("{}{}", base.trim_end_matches('/'), path);
    let mut child = Command::new("curl")
        .args(["-sS", "--max-time", "15", "--max-filesize", "4000000", "--proto", "=http,https", "-X", method, "-w", "\n%{http_code}", "-K", "-", "--", &url])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|_| "Couldn't reach PocketPals from this machine.".to_string())?;
    let config = format!("header = \"Authorization: Bearer {}\"\nheader = \"Accept: application/json\"\n", key.replace(['"', '\\', '\n', '\r'], ""));
    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(config.as_bytes()).await;
    }
    let out = timeout(Duration::from_secs(20), child.wait_with_output())
        .await
        .map_err(|_| "PocketPals took too long to answer.".to_string())?
        .map_err(|_| "Couldn't reach PocketPals from this machine.".to_string())?;
    if !out.status.success() {
        return Err("Can't reach PocketPals. Check its address.".into());
    }
    let text = String::from_utf8_lossy(&out.stdout).into_owned();
    let (body, code) = text.rsplit_once('\n').unwrap_or(("", "0"));
    Ok(Reply { status: code.trim().parse().unwrap_or(0), body: body.to_string() })
}

/// What PocketPals said was wrong, in its own words if it said.
fn why(r: &Reply) -> String {
    let said = serde_json::from_str::<Value>(&r.body).ok().and_then(|v| v["detail"].as_str().map(str::to_string));
    match (r.status, said) {
        (401, _) => "PocketPals doesn't recognise that key. It may have been removed.".into(),
        (403, Some(m)) => m,
        (_, Some(m)) => m,
        (0, _) => "PocketPals didn't answer.".into(),
        (s, None) => format!("PocketPals said no ({s})."),
    }
}

/// Is this address and key a PocketPals that will talk to us? Returns what it says about itself.
pub async fn ping(base: &str, key: &str) -> Result<Value, String> {
    let r = request("GET", base, "/api/v1/ping", key).await?;
    if r.status != 200 {
        return Err(why(&r));
    }
    serde_json::from_str(&r.body).map_err(|_| "That address isn't PocketPals.".to_string())
}

/// Every child's jobs from one day to another (YYYY-MM-DD).
pub async fn chores(base: &str, key: &str, from: &str, to: &str) -> Result<Value, String> {
    let r = request("GET", base, &format!("/api/v1/chores?from={from}&to={to}"), key).await?;
    if r.status != 200 {
        return Err(why(&r));
    }
    serde_json::from_str(&r.body).map_err(|_| "PocketPals sent something we couldn't read.".to_string())
}

/// Tick a job off for a child on a day, or take the tick back.
pub async fn tick(base: &str, key: &str, kid: i64, chore: i64, day: &str, done: bool) -> Result<(), String> {
    let r = request(if done { "POST" } else { "DELETE" }, base, &format!("/api/v1/kids/{kid}/chores/{chore}/done?day={day}"), key).await?;
    if r.status == 204 || r.status == 200 {
        Ok(())
    } else {
        Err(why(&r))
    }
}

/// A date like 2026-11-02, and nothing else (it goes into a web address).
pub fn is_day(s: &str) -> bool {
    s.len() == 10 && chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d").is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::{io::{AsyncReadExt, AsyncWriteExt}, net::TcpListener};

    /// A stand-in PocketPals: answers each request from a list of (starts with, status, body), and keeps what it was asked.
    async fn fake(routes: Vec<(&'static str, u16, &'static str)>) -> (String, std::sync::Arc<std::sync::Mutex<Vec<String>>>) {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let seen = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
        let log = seen.clone();
        tokio::spawn(async move {
            loop {
                let Ok((mut s, _)) = listener.accept().await else { return };
                let mut buf = vec![0u8; 8192];
                let n = s.read(&mut buf).await.unwrap_or(0);
                let text = String::from_utf8_lossy(&buf[..n]).to_string();
                let line = text.lines().next().unwrap_or("").to_string();
                let auth = text.lines().find(|l| l.to_lowercase().starts_with("authorization:")).unwrap_or("").to_string();
                log.lock().unwrap().push(format!("{line} | {auth}"));
                let path = line.split(' ').nth(1).unwrap_or("").to_string();
                let (status, body) = routes.iter().find(|(p, ..)| path.starts_with(p)).map(|(_, s, b)| (*s, *b)).unwrap_or((404, "{}"));
                let reply = format!("HTTP/1.1 {status} X\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len());
                let _ = s.write_all(reply.as_bytes()).await;
            }
        });
        (base, seen)
    }

    #[tokio::test]
    async fn reads_jobs_and_sends_the_key_without_putting_it_in_the_address() {
        let (base, seen) = fake(vec![("/api/v1/chores", 200, r#"{"kids":[{"id":1,"name":"Sam"}],"days":[]}"#)]).await;
        let v = chores(&base, "pp_secret", "2026-11-02", "2026-11-08").await.unwrap();
        assert_eq!(v["kids"][0]["name"], "Sam");
        let log = seen.lock().unwrap().join("\n");
        assert!(log.contains("GET /api/v1/chores?from=2026-11-02&to=2026-11-08"));
        assert!(log.to_lowercase().contains("authorization: bearer pp_secret"));
    }

    #[tokio::test]
    async fn ticks_and_unticks_and_passes_on_what_pocketpals_says() {
        let (base, seen) = fake(vec![
            ("/api/v1/kids/1/chores/5/done", 204, ""),
            ("/api/v1/kids/1/chores/6/done", 409, r#"{"detail":"Tick off the steps first: 2 to go."}"#),
            ("/api/v1/ping", 401, r#"{"detail":"nope"}"#),
        ])
        .await;
        tick(&base, "k", 1, 5, "2026-11-02", true).await.unwrap();
        tick(&base, "k", 1, 5, "2026-11-02", false).await.unwrap();
        let log = seen.lock().unwrap().join("\n");
        assert!(log.contains("POST /api/v1/kids/1/chores/5/done?day=2026-11-02") && log.contains("DELETE /api/v1/kids/1/chores/5/done?day=2026-11-02"));
        assert_eq!(tick(&base, "k", 1, 6, "2026-11-02", true).await.unwrap_err(), "Tick off the steps first: 2 to go.");
        assert!(ping(&base, "k").await.unwrap_err().contains("doesn't recognise that key"));
    }

    #[tokio::test]
    async fn an_address_that_isnt_there_says_so() {
        assert!(ping("http://127.0.0.1:9", "k").await.unwrap_err().contains("Can't reach PocketPals"));
    }

    #[test]
    fn only_real_days_go_into_an_address() {
        assert!(is_day("2026-11-02"));
        assert!(!is_day("2026-11-02/../x") && !is_day("tomorrow") && !is_day("2026-13-40"));
    }
}
