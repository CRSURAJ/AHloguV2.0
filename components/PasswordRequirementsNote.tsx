import { PASSWORD_REQUIREMENTS } from "@/lib/auth/passwordPolicy";

type PasswordRequirementsNoteProps = {
  compact?: boolean;
};

export default function PasswordRequirementsNote({
  compact = false,
}: PasswordRequirementsNoteProps) {
  return (
    <div
      style={{
        marginTop: compact ? "8px" : "12px",
        marginBottom: compact ? "8px" : "14px",
        borderRadius: "14px",
        padding: compact ? "10px 12px" : "12px 14px",
        background: "rgba(83, 188, 123, 0.08)",
        border: "1px solid rgba(83, 188, 123, 0.18)",
        color: "rgba(238, 247, 243, 0.82)",
        fontSize: compact ? "12px" : "13px",
        lineHeight: 1.5,
      }}
    >
      <strong style={{ color: "var(--heading)" }}>Password requirements</strong>
      <ul
        style={{
          margin: "8px 0 0",
          paddingLeft: "18px",
        }}
      >
        {PASSWORD_REQUIREMENTS.map((requirement) => (
          <li key={requirement}>{requirement}</li>
        ))}
      </ul>
    </div>
  );
}
