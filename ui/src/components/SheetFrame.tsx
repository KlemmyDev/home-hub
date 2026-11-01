import type { CSSProperties, ReactNode } from "react";
import { XIcon } from "../lib/icons";
import { useHub } from "../hub";

export const Lab = ({ children }: { children: ReactNode }) => <div className="cap" style={{ margin: "22px 0 8px" }}>{children}</div>;
export const Pill = ({ on, onClick, children, style }: { on?: boolean; onClick?: () => void; children: ReactNode; style?: CSSProperties }) =>
  <button className={"pill" + (on ? " on" : "")} onClick={onClick} style={style}>{children}</button>;

/** The bottom sheet's header, scrolling body, an error line and a footer of buttons. */
export function SheetFrame({ title, body, foot, error }: { title: string; body: ReactNode; foot: ReactNode; error?: string }) {
  const { closeSheet } = useHub();
  return (
    <>
      <div className="fx shh" style={{ justifyContent: "space-between" }}>
        <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: "-.04em" }}>{title}</div>
        <button className="cnav" aria-label="Close" onClick={closeSheet}><XIcon /></button>
      </div>
      <div className="scroll shb" style={{ flex: 1, minHeight: 0 }}>{body}</div>
      <div className="err shb" role="alert" style={{ margin: 0, paddingTop: 0, paddingBottom: 0, minHeight: 0 }}>{error}</div>
      <div className="fx shf" style={{ gap: 12, borderTop: "1px solid #edf0f5" }}>{foot}</div>
    </>
  );
}
