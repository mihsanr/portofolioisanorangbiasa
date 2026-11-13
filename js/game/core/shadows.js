import { ShaderChunk } from 'three';

/* Bayangan hemat untuk profil medium/low. Bawaan three.js r170 mengambil 17 sampel shadow map per piksel
   (PCF) — mahal di HP karena dibayar oleh hampir seluruh layar. Di sini cabang PCF diganti PCF bilinear
   2×2 (4 sampel): tepi tetap halus/ter-antialias, biaya ±1/4. Profil high tetap memakai PCF_SOFT bawaan.
   Harus dipanggil sebelum material pertama dikompilasi. Versi three.js dikunci di js/vendor, jadi aman. */
const START = '#if defined( SHADOWMAP_TYPE_PCF )';
const END = '#elif defined( SHADOWMAP_TYPE_PCF_SOFT )';
const LEAN = /* glsl */`
      vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
      vec2 st = shadowCoord.xy * shadowMapSize - 0.5;
      vec2 f = fract( st );
      vec2 base = ( floor( st ) + 0.5 ) * texelSize;
      float s00 = texture2DCompare( shadowMap, base, shadowCoord.z );
      float s10 = texture2DCompare( shadowMap, base + vec2( texelSize.x, 0.0 ), shadowCoord.z );
      float s01 = texture2DCompare( shadowMap, base + vec2( 0.0, texelSize.y ), shadowCoord.z );
      float s11 = texture2DCompare( shadowMap, base + texelSize, shadowCoord.z );
      shadow = mix( mix( s00, s10, f.x ), mix( s01, s11, f.x ), f.y );
    `;

export function installLeanShadows() {
  const src = ShaderChunk.shadowmap_pars_fragment;
  const from = src.indexOf('float getShadow(');
  const a = src.indexOf(START, from), b = src.indexOf(END, from);
  if (from < 0 || a < 0 || b < 0) return false;      // struktur chunk berubah: biarkan bawaan
  let out = src.slice(0, a + START.length) + LEAN + src.slice(b);
  /* semua mode: bayangan memudar menjelang tepi jangkauan shadow map, jadi tidak ada garis potong */
  const ret = 'return mix( 1.0, shadow, shadowIntensity );', r = out.indexOf(ret, out.indexOf('float getShadow('));
  const FADE = 'vec2 sfd = abs( shadowCoord.xy - 0.5 ); shadow = mix( shadow, 1.0, smoothstep( 0.38, 0.5, max( sfd.x, sfd.y ) ) ); ';
  if (r > 0) out = out.slice(0, r) + FADE + out.slice(r);
  ShaderChunk.shadowmap_pars_fragment = out;
  return true;
}
