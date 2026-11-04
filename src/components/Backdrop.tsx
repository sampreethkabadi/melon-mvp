// Two soft, slowly drifting color blobs behind a page. Colors come from career interests.

export const INTEREST_COLORS: Record<string, { label: string; color: string }> = {
  data: { label: "Data & AI", color: "#5AB8E6" },
  cyber: { label: "Cybersecurity", color: "#8B7CF6" },
  soft: { label: "Software", color: "#7BD389" },
  ux: { label: "Design & UX", color: "#FF8FA3" },
  biz: { label: "Business & Finance", color: "#F2C14E" },
  health: { label: "Health", color: "#3BC9DB" },
  arts: { label: "Arts & Media", color: "#FFB4A2" },
  unsure: { label: "Not sure yet", color: "#FFD166" },
};

export function Backdrop({ interests = [] }: { interests?: string[] }) {
  const ids = interests.filter((i) => INTEREST_COLORS[i]);
  const c1 = INTEREST_COLORS[ids[0] ?? "unsure"].color;
  const c2 = INTEREST_COLORS[ids[1] ?? ids[0] ?? "arts"].color;
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <span className="backdrop-blob" style={{ width: 560, height: 560, right: -120, top: -160, backgroundColor: c1 }} />
      <span
        className="backdrop-blob"
        style={{ width: 500, height: 500, left: -140, bottom: -160, backgroundColor: c2, animationDuration: "29s", animationDelay: "-7s" }}
      />
    </div>
  );
}
