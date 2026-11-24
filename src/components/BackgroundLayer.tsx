import { useBackground } from '../utils/background';

export function BackgroundLayer() {
  const { settings: s, imageUrl } = useBackground();
  if (!imageUrl) return null;

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <div
        className="absolute"
        style={{
          // Mở rộng ra ngoài khung khi làm mờ để mép ảnh không bị nhạt
          inset: s.blur > 0 ? `-${s.blur * 2}px` : 0,
          backgroundImage: `url("${imageUrl}")`,
          backgroundSize: s.fit === 'repeat' ? 'auto' : s.fit,
          backgroundRepeat: s.fit === 'repeat' ? 'repeat' : 'no-repeat',
          backgroundPosition: `${s.posX}% ${s.posY}%`,
          opacity: s.opacity / 100,
          filter: `brightness(${s.brightness}%) contrast(${s.contrast}%) saturate(${s.saturate}%) blur(${s.blur}px)`,
        }}
      />
      <div className="absolute inset-0 bg-black" style={{ opacity: s.overlay / 100 }} />
    </div>
  );
}
