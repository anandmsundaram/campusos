import { ImageResponse } from 'next/og'

export const size = { width: 512, height: 512 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 512,
          height: 512,
          background: '#2563eb',
          borderRadius: 112,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Pointy-top hexagon — CampusOS brand mark, matching the ⬡ in the nav */}
        <svg width="360" height="360" viewBox="0 0 360 360" fill="none">
          <path
            d="M 180 32 L 308 106 L 308 254 L 180 328 L 52 254 L 52 106 Z"
            stroke="white"
            strokeWidth="22"
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
