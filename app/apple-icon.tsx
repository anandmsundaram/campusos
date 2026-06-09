import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          background: '#2563eb',
          borderRadius: 40,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Pointy-top hexagon — CampusOS brand mark, matching the ⬡ in the nav */}
        <svg width="128" height="128" viewBox="0 0 128 128" fill="none">
          <path
            d="M 64 12 L 109 38 L 109 90 L 64 116 L 19 90 L 19 38 Z"
            stroke="white"
            strokeWidth="8"
            fill="none"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
      </div>
    ),
    { ...size },
  )
}
