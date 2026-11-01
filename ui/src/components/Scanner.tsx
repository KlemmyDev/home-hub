import { useEffect, useRef, useState } from "react";

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"];
type Detector = { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> };

/** Why this screen can't scan, or null if it can. The camera is only allowed on https (or localhost), and the barcode reader is built into Chrome on Android. */
export function scanProblem(): string | null {
  if (!window.isSecureContext) return "The camera only works on a secure (https) address. Open the hub that way, or type the barcode instead.";
  if (!navigator.mediaDevices?.getUserMedia) return "This screen can't use the camera. Type the barcode instead.";
  if (!("BarcodeDetector" in window)) return "This browser can't read barcodes. Chrome on the tablet can; here, type the barcode instead.";
  return null;
}

/** The camera, with a frame to line the barcode up in. Calls back once with the number it reads. */
export function Scanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let stream: MediaStream | undefined, timer: ReturnType<typeof setInterval> | undefined, stopped = false, last = "";
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } }, audio: false });
        if (stopped) { stream.getTracks().forEach(t => t.stop()); return; }
        const v = video.current!;
        v.srcObject = stream;
        await v.play();
        const det: Detector = new (window as any).BarcodeDetector({ formats: FORMATS });
        timer = setInterval(async () => {
          try {
            const hit = (await det.detect(v)).map(b => b.rawValue).find(c => /^\d{8,14}$/.test(c));
            if (!hit) { last = ""; return; }
            if (hit === last) { stopped = true; clearInterval(timer); navigator.vibrate?.(30); onCode(hit); } else last = hit;      // the same number twice running, so one misread doesn't count
          } catch { /* a frame that can't be read is just skipped */ }
        }, 250);
      } catch (e: any) { setErr(e?.name === "NotAllowedError" ? "The camera is switched off for this page. Allow it in the browser's settings, or type the barcode instead." : "Couldn't start the camera. Type the barcode instead."); }
    })();
    return () => { stopped = true; clearInterval(timer); stream?.getTracks().forEach(t => t.stop()); };
  }, []);
  return (
    <div className="scanbox" role="dialog" aria-label="Scan a barcode">
      <video ref={video} muted playsInline />
      <span className="scanframe" aria-hidden />
      <div className="scanhint">{err || "Hold the barcode inside the frame"}</div>
      <button className="scanx" onClick={onClose}>Cancel</button>
    </div>
  );
}
