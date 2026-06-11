"use client";

import FeedbackMessage from "@/components/FeedbackMessage";

type AccountMessageDialogProps = {
  message: string;
  onClose: () => void;
};

export default function AccountMessageDialog({ message, onClose }: AccountMessageDialogProps) {
  if (!message) {
    return null;
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "grid",
        placeItems: "center",
        padding: "20px",
        background: "rgba(0,0,0,0.48)",
        zIndex: 100,
      }}
    >
      <div
        style={{
          width: "min(460px, 100%)",
          borderRadius: "24px",
          padding: "24px",
          background: "#11302D",
          color: "#eef7f3",
          border: "1px solid rgba(255,255,255,0.14)",
        }}
      >
        <FeedbackMessage message={message} />
        <button
          type="button"
          onClick={onClose}
          style={{
            border: 0,
            borderRadius: "14px",
            padding: "12px 16px",
            background: "#53BC7B",
            color: "#11302D",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
}
