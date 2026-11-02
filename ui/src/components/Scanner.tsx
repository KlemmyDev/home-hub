import { useEffect, useRef, useState } from "react";
import { useHold } from "../lib/power";

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"];
type Source = HTMLVideoElement | ImageBitmap;
type Detector = { detect: (v: Source) => Promise<{ rawValue: string }[]> };
const NUMBER = /^\d{8,14}$/;

/** Why this screen can't scan, or null if it can. The camera is only allowed on https (or localhost). Chrome on Android has a barcode reader built in; everywhere else (iPhone, desktop) a small reader is loaded the first time. */
export function scanProblem(): string | null {
  if (!window.isSecureContext) return "The camera only works on a secure (https) address. Open the hub that way, or type the barcode instead.";
  if (!navigator.mediaDevices?.getUserMedia) return "This screen can't use the camera. Type the barcode instead.";
  if (!("BarcodeDetector" in window) && typeof WebAssembly !== "object") return "This browser can't read barcodes. Type the barcode instead.";
  return null;
}

/** The browser's own barcode reader if it has one, otherwise the same reader as a bundled script (kept in the hub, nothing from the internet). */
async function makeDetector(): Promise<Detector> {
  if ("BarcodeDetector" in window) return new (window as any).BarcodeDetector({ formats: FORMATS });
  const [{ BarcodeDetector, setZXingModuleOverrides, prepareZXingModule }, wasm] = await Promise.all([import("barcode-detector/ponyfill"), import("zxing-wasm/reader/zxing_reader.wasm?url")]);
  setZXingModuleOverrides({ locateFile: (path: string, prefix: string) => path.endsWith(".wasm") ? wasm.default : prefix + path });
  await prepareZXingModule({ fireImmediately: true });      // starts the reader now, so a problem shows up here and not as frames that silently read nothing
  return new BarcodeDetector({ formats: FORMATS as any }) as unknown as Detector;
}

/** The camera to use. On newer iPhones "the back camera" can be the ultra-wide lens, which can't focus up close, so the plain back camera is asked for by name. */
async function openCamera(): Promise<MediaStream> {
  const want = { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } };
  let stream = await navigator.mediaDevices.getUserMedia({ video: want, audio: false });
  try {
    const cams = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === "videoinput");
    const now = stream.getVideoTracks()[0]?.label || "";
    const better = cams.find(d => /back camera$/i.test(d.label) || /^back (dual|triple)/i.test(d.label)) || cams.find(d => /back|rear|environment/i.test(d.label) && !/ultra|wide|telephoto|front/i.test(d.label));
    if (better && /ultra/i.test(now) && better.deviceId) {
      stream.getTracks().forEach(t => t.stop());
      stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: better.deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
    }
  } catch { /* the first camera is fine */ }
  try { await stream.getVideoTracks()[0]?.applyConstraints({ advanced: [{ focusMode: "continuous" } as any] }); } catch { /* not every phone lets the page choose focus */ }
  return stream;
}

/** The camera, with a frame to line the barcode up in. Calls back once with the number it reads. */
export function Scanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const det = useRef<Detector | null>(null);
  useHold(true);
  const [err, setErr] = useState(""), [ready, setReady] = useState(false), [slow, setSlow] = useState(false), [photoMsg, setPhotoMsg] = useState("");
  useEffect(() => {
    let stream: MediaStream | undefined, timer: ReturnType<typeof setInterval> | undefined, stopped = false, last = "", started = Date.now(), failed = "";
    (async () => {
      try {
        stream = await openCamera();
        if (stopped) { stream.getTracks().forEach(t => t.stop()); return; }
        const v = video.current!;
        v.srcObject = stream;
        await v.play();
        const d = det.current = await makeDetector();
        if (stopped) return;
        setReady(true);
        let busy = false;
        timer = setInterval(async () => {
          if (busy || stopped) return;
          busy = true;
          try {
            const hit = (await d.detect(v)).map(b => b.rawValue).find(c => NUMBER.test(c));
            if (!hit) { last = ""; if (Date.now() - started > 8000) setSlow(true); busy = false; return; }
            if (hit === last) { stopped = true; clearInterval(timer); navigator.vibrate?.(30); onCode(hit); return; } else last = hit;      // the same number twice running, so one misread doesn't count
          } catch (e: any) {
            const msg = String(e?.message || e?.name || e);
            if (msg !== failed) { failed = msg; setErr("The reader had a problem: " + msg); }      // shown, so a problem isn't mistaken for "nothing in view"
          }
          busy = false;
        }, 250);
      } catch (e: any) { setErr(e?.name === "NotAllowedError" ? "The camera is switched off for this page. Allow it in the browser's settings, or type the barcode instead." : "Couldn't start the camera: " + String(e?.message || e?.name || e)); }
    })();
    return () => { stopped = true; clearInterval(timer); stream?.getTracks().forEach(t => t.stop()); };
  }, []);

  /** A photo from the phone's own camera app (which focuses properly), read the same way. */
  const photo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setPhotoMsg("Reading the photo…");
    try {
      const d = det.current || await makeDetector();
      const img = await createImageBitmap(f);
      const hit = (await d.detect(img)).map(b => b.rawValue).find(c => NUMBER.test(c));
      img.close?.();
      if (hit) { navigator.vibrate?.(30); onCode(hit); } else setPhotoMsg("Couldn't find a barcode in that photo. Try again closer, with the bars filling the picture.");
    } catch (er: any) { setPhotoMsg("Couldn't read that photo: " + String(er?.message || er?.name || er)); }
  };

  const hint = photoMsg || err || (!ready ? "Starting the camera…" : slow ? "Still looking. Try about 15 cm away, in good light, or take a photo." : "Hold the barcode inside the frame");
  return (
    <div className="scanbox" role="dialog" aria-label="Scan a barcode">
      <video ref={video} muted playsInline />
      <span className="scanframe" aria-hidden />
      <div className="scanhint">{hint}</div>
      <div className="scanbtns">
        <label className="scanx photo">Take a photo<input type="file" accept="image/*" capture="environment" onChange={photo} hidden /></label>
        <button className="scanx" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
