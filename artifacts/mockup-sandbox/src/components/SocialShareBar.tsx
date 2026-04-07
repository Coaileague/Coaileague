import { useState } from "react";

type Platform = "facebook" | "instagram" | "linkedin";

const PLATFORM_CONFIG: Record<
  Platform,
  { label: string; color: string; hoverColor: string; icon: string; url: string; note?: string }
> = {
  facebook: {
    label: "Facebook",
    color: "#1877F2",
    hoverColor: "#1565c0",
    icon: "F",
    url: "https://www.facebook.com/",
    note: "Go to your Facebook page or profile and create a new post, then upload the downloaded image.",
  },
  instagram: {
    label: "Instagram",
    color: "#E1306C",
    hoverColor: "#c2185b",
    icon: "Ig",
    url: "https://www.instagram.com/",
    note: "Open Instagram on your phone, tap + to create a post, and select the downloaded image.",
  },
  linkedin: {
    label: "LinkedIn",
    color: "#0A66C2",
    hoverColor: "#084fa0",
    icon: "in",
    url: "https://www.linkedin.com/feed/",
    note: "Click 'Start a post' on LinkedIn, then upload the downloaded image.",
  },
};

function downloadAdImage() {
  window.print();
}

function openPlatform(platform: Platform, setActive: (p: Platform | null) => void) {
  setActive(platform);
  window.open(PLATFORM_CONFIG[platform].url, "_blank", "noopener,noreferrer");
}

export default function SocialShareBar() {
  const [activePlatform, setActivePlatform] = useState<Platform | null>(null);
  const [downloaded, setDownloaded] = useState(false);
  const [visible, setVisible] = useState(true);

  function handleDownload() {
    setDownloaded(true);
    downloadAdImage();
    setTimeout(() => setDownloaded(false), 3000);
  }

  function handlePlatformClick(platform: Platform) {
    if (!downloaded) {
      handleDownload();
      setTimeout(() => openPlatform(platform, setActivePlatform), 800);
    } else {
      openPlatform(platform, setActivePlatform);
    }
  }

  if (!visible) {
    return (
      <button
        onClick={() => setVisible(true)}
        style={{
          position: "fixed",
          bottom: "1.5rem",
          right: "1.5rem",
          zIndex: 9999,
          background: "rgba(10,22,40,0.92)",
          border: "1px solid rgba(201,168,76,0.5)",
          borderRadius: "50%",
          width: "3rem",
          height: "3rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          backdropFilter: "blur(8px)",
          boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
          color: "#C9A84C",
          fontSize: "1.2rem",
        }}
        title="Show share options"
      >
        ↑
      </button>
    );
  }

  return (
    <>
      {/* Print-only styles: hide toolbar, show full ad */}
      <style>{`
        @media print {
          .social-share-bar { display: none !important; }
          body { margin: 0; padding: 0; }
        }
      `}</style>

      <div
        className="social-share-bar"
        style={{
          position: "fixed",
          bottom: "1.5rem",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 9999,
          background: "rgba(10,22,40,0.92)",
          border: "1px solid rgba(201,168,76,0.35)",
          borderRadius: "12px",
          padding: "0.75rem 1.25rem",
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          backdropFilter: "blur(12px)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          flexWrap: "wrap",
          maxWidth: "calc(100vw - 3rem)",
        }}
      >
        {/* Label */}
        <span
          style={{
            color: "rgba(255,255,255,0.6)",
            fontSize: "0.75rem",
            fontWeight: 500,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            fontFamily: "system-ui, -apple-system, sans-serif",
            whiteSpace: "nowrap",
          }}
        >
          Share Ad
        </span>

        {/* Download button */}
        <button
          onClick={handleDownload}
          style={{
            background: downloaded ? "#2e7d32" : "rgba(201,168,76,0.15)",
            border: "1px solid rgba(201,168,76,0.5)",
            borderRadius: "8px",
            color: downloaded ? "#fff" : "#C9A84C",
            padding: "0.45rem 0.9rem",
            fontSize: "0.8rem",
            fontWeight: 600,
            cursor: "pointer",
            transition: "all 0.2s",
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
            fontFamily: "system-ui, -apple-system, sans-serif",
            whiteSpace: "nowrap",
          }}
          title="Save as PDF or image via your browser's print dialog"
        >
          {downloaded ? "✓ Saved!" : "↓ Save Image"}
        </button>

        {/* Divider */}
        <div style={{ width: "1px", height: "1.5rem", background: "rgba(255,255,255,0.15)" }} />

        {/* Platform buttons */}
        {(Object.entries(PLATFORM_CONFIG) as [Platform, typeof PLATFORM_CONFIG[Platform]][]).map(
          ([platform, config]) => (
            <div key={platform} style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center" }}>
              <button
                onClick={() => handlePlatformClick(platform)}
                style={{
                  background: activePlatform === platform ? config.hoverColor : config.color,
                  border: "none",
                  borderRadius: "8px",
                  color: "white",
                  padding: "0.45rem 0.85rem",
                  fontSize: "0.8rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  transition: "all 0.2s",
                  fontFamily: "system-ui, -apple-system, sans-serif",
                  whiteSpace: "nowrap",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.35rem",
                }}
                title={`Post on ${config.label}`}
              >
                <span style={{ fontFamily: "Georgia, serif" }}>{config.icon}</span>
                {config.label}
              </button>
            </div>
          )
        )}

        {/* Instructions bubble when a platform is active */}
        {activePlatform && (
          <div
            style={{
              position: "fixed",
              bottom: "5.5rem",
              left: "50%",
              transform: "translateX(-50%)",
              background: "rgba(10,22,40,0.97)",
              border: `1px solid ${PLATFORM_CONFIG[activePlatform].color}55`,
              borderRadius: "10px",
              padding: "0.9rem 1.25rem",
              maxWidth: "22rem",
              boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
              backdropFilter: "blur(12px)",
              zIndex: 10000,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.75rem" }}>
              <p
                style={{
                  color: "rgba(255,255,255,0.85)",
                  fontSize: "0.8rem",
                  lineHeight: 1.55,
                  margin: 0,
                  fontFamily: "system-ui, -apple-system, sans-serif",
                }}
              >
                <strong style={{ color: PLATFORM_CONFIG[activePlatform].color }}>
                  {PLATFORM_CONFIG[activePlatform].label}
                </strong>{" "}
                opened in a new tab.
                <br />
                {PLATFORM_CONFIG[activePlatform].note}
              </p>
              <button
                onClick={() => setActivePlatform(null)}
                style={{
                  background: "none",
                  border: "none",
                  color: "rgba(255,255,255,0.4)",
                  cursor: "pointer",
                  fontSize: "1rem",
                  padding: "0",
                  lineHeight: 1,
                  flexShrink: 0,
                }}
              >
                ×
              </button>
            </div>
          </div>
        )}

        {/* Hide button */}
        <button
          onClick={() => { setVisible(false); setActivePlatform(null); }}
          style={{
            background: "none",
            border: "none",
            color: "rgba(255,255,255,0.3)",
            cursor: "pointer",
            fontSize: "1rem",
            padding: "0 0.25rem",
            lineHeight: 1,
            flexShrink: 0,
          }}
          title="Hide toolbar"
        >
          ×
        </button>
      </div>
    </>
  );
}
