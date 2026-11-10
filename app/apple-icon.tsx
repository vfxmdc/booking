import { ImageResponse } from 'next/og';

// Home-screen icon for iPhone / iPad ("Add to Home Screen")
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #38bdf8, #2563eb)',
        }}
      >
        <div style={{ position: 'relative', width: 92, height: 92, display: 'flex' }}>
          <div style={{ position: 'absolute', left: 32, top: 0, width: 28, height: 92, background: 'white', borderRadius: 7 }} />
          <div style={{ position: 'absolute', left: 0, top: 32, width: 92, height: 28, background: 'white', borderRadius: 7 }} />
        </div>
      </div>
    ),
    { ...size }
  );
}
