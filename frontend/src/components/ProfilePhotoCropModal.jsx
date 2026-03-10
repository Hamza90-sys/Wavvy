import Cropper from "react-easy-crop";
import React, { useCallback, useState } from "react";
import { createPortal } from "react-dom";

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", reject);
    image.src = src;
  });
}

async function getCroppedAvatar(src, cropPixels) {
  const image = await loadImage(src);
  const canvas = document.createElement("canvas");
  const size = 512;
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    image,
    cropPixels.x,
    cropPixels.y,
    cropPixels.width,
    cropPixels.height,
    0,
    0,
    size,
    size
  );

  const blob = await new Promise((resolve) => {
    canvas.toBlob((result) => resolve(result), "image/jpeg", 0.92);
  });

  if (!blob) {
    throw new Error("Unable to crop image.");
  }

  return new File([blob], `avatar-${Date.now()}.jpg`, { type: "image/jpeg" });
}

export default function ProfilePhotoCropModal({ open, imageSrc, onClose, onSave }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [saving, setSaving] = useState(false);

  const onCropComplete = useCallback((_croppedArea, pixels) => {
    setCroppedAreaPixels(pixels);
  }, []);

  if (!open || !imageSrc) return null;

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <section className="modal-card avatar-crop-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <h3>Adjust your profile photo</h3>
          <button type="button" className="ghost-btn" onClick={onClose}>Close</button>
        </div>

        <div className="avatar-crop-stage">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>

        <div className="avatar-crop-zoom">
          <span>Zoom</span>
          <input
            type="range"
            min="1"
            max="3"
            step="0.01"
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
          />
        </div>

        <div className="avatar-crop-actions">
          <button type="button" className="ghost-btn" onClick={onClose} disabled={saving}>Cancel</button>
          <button
            type="button"
            className="primary-btn"
            disabled={saving || !croppedAreaPixels}
            onClick={async () => {
              if (!croppedAreaPixels) return;
              setSaving(true);
              try {
                const croppedFile = await getCroppedAvatar(imageSrc, croppedAreaPixels);
                onSave(croppedFile);
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}
