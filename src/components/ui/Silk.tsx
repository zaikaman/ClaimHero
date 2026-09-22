import React, { forwardRef, useRef, useMemo, useLayoutEffect, useEffect, useState, useCallback } from 'react';
import { Canvas, useFrame, useThree, type RootState } from '@react-three/fiber';
import { Color, Mesh, ShaderMaterial, IUniform } from 'three';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { SilkFallback } from './SilkFallback';

const hexToNormalizedRGB = (hex: string): [number, number, number] => {
  const cleaned = hex.replace('#', '');
  return [
    parseInt(cleaned.slice(0, 2), 16) / 255,
    parseInt(cleaned.slice(2, 4), 16) / 255,
    parseInt(cleaned.slice(4, 6), 16) / 255,
  ];
};

const vertexShader = `
varying vec2 vUv;
varying vec3 vPosition;

void main() {
  vPosition = position;
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = `
varying vec2 vUv;
varying vec3 vPosition;

uniform float uTime;
uniform vec3  uColor;
uniform float uSpeed;
uniform float uScale;
uniform float uRotation;
uniform float uNoiseIntensity;

const float e = 2.71828182845904523536;

float noise(vec2 texCoord) {
  float G = e;
  vec2  r = (G * sin(G * texCoord));
  return fract(r.x * r.y * (1.0 + texCoord.x));
}

vec2 rotateUvs(vec2 uv, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  mat2  rot = mat2(c, -s, s, c);
  return rot * uv;
}

void main() {
  float rnd        = noise(gl_FragCoord.xy);
  vec2  uv         = rotateUvs(vUv * uScale, uRotation);
  vec2  tex        = uv * uScale;
  float tOffset    = uSpeed * uTime;

  tex.y += 0.03 * sin(8.0 * tex.x - tOffset);

  float pattern = 0.6 +
                  0.4 * sin(5.0 * (tex.x + tex.y +
                                   cos(3.0 * tex.x + 5.0 * tex.y) +
                                   0.02 * tOffset) +
                            sin(20.0 * (tex.x + tex.y - 0.1 * tOffset)));

  vec4 col = vec4(uColor, 1.0) * vec4(pattern) - rnd / 15.0 * uNoiseIntensity;
  col.a = 1.0;
  gl_FragColor = col;
}
`;

interface SilkUniforms {
  [uniform: string]: IUniform;
  uSpeed: { value: number };
  uScale: { value: number };
  uNoiseIntensity: { value: number };
  uColor: { value: Color };
  uRotation: { value: number };
  uTime: { value: number };
}

interface SilkPlaneProps {
  uniforms: SilkUniforms;
}

const SilkPlane = forwardRef<Mesh, SilkPlaneProps>(function SilkPlane({ uniforms }, ref) {
  const { viewport } = useThree();

  useLayoutEffect(() => {
    if (ref && 'current' in ref && ref.current) {
      ref.current.scale.set(viewport.width, viewport.height, 1);
    }
  }, [ref, viewport]);

  useFrame((_, delta) => {
    if (ref && 'current' in ref && ref.current) {
      const material = ref.current.material as ShaderMaterial;
      if (material && material.uniforms && material.uniforms.uTime) {
        // Clamp tab-switch / jank spikes so the animation resumes smoothly
        // instead of leaping forward after a long frame gap.
        material.uniforms.uTime.value += 0.1 * Math.min(delta, 0.05);
      }
    }
  });

  return (
    <mesh ref={ref}>
      <planeGeometry args={[1, 1, 1, 1]} />
      <shaderMaterial uniforms={uniforms} vertexShader={vertexShader} fragmentShader={fragmentShader} />
    </mesh>
  );
});
SilkPlane.displayName = 'SilkPlane';

/**
 * Probe for a real GPU-backed WebGL context. The probe context is released
 * immediately via WEBGL_lose_context so it never occupies one of the
 * browser's limited live-context slots on memory-constrained devices.
 */
function canCreateWebGLContext(): boolean {
  try {
    if (typeof document === 'undefined') return true;
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (!gl) return false;
    try {
      (gl.getExtension('WEBGL_lose_context') as { loseContext: () => void } | null)?.loseContext();
    } catch {
      // Releasing is best-effort; the probe result still stands.
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Cap the render resolution by device class. Fill rate (pixels shaded per
 * frame) dominates this full-screen shader's GPU cost: constrained devices
 * render at 1x and upscale, desktops at most at 1.5x. On a blurred ambient
 * backdrop under a vignette overlay the difference is imperceptible, while
 * the frame-time saving on mobile GPUs is substantial.
 */
function getCappedDpr(): number {
  if (typeof window === 'undefined') return 1;
  const raw = window.devicePixelRatio || 1;
  const coarse =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches;
  const smallViewport = window.innerWidth < 768;
  return Math.min(raw, coarse || smallViewport ? 1 : 1.5);
}

export interface SilkProps {
  speed?: number;
  scale?: number;
  color?: string;
  noiseIntensity?: number;
  rotation?: number;
  className?: string;
  style?: React.CSSProperties;
}

export const Silk: React.FC<SilkProps> = ({
  speed = 5,
  scale = 1,
  color = '#7B7481',
  noiseIntensity = 1.5,
  rotation = 0,
  className,
  style,
}) => {
  const meshRef = useRef<Mesh>(null);
  const [isVisible, setIsVisible] = React.useState<boolean>(() => {
    return typeof document !== "undefined" ? document.visibilityState === "visible" : true;
  });
  const [isReady, setIsReady] = useState<boolean>(false);
  const [contextEpoch, setContextEpoch] = useState<number>(0);
  const [webGLCapable] = useState<boolean>(() => canCreateWebGLContext());
  const [dpr] = useState<number>(() => getCappedDpr());

  const prefersReducedMotion = React.useMemo(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsVisible(document.visibilityState === "visible");
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const uniforms = useMemo<SilkUniforms>(
    () => ({
      uSpeed: { value: speed },
      uScale: { value: scale },
      uNoiseIntensity: { value: noiseIntensity },
      uColor: { value: new Color(...hexToNormalizedRGB(color)) },
      uRotation: { value: rotation },
      uTime: { value: 0 },
    }),
    [],
  );

  useEffect(() => {
    uniforms.uSpeed.value = speed;
    uniforms.uScale.value = scale;
    uniforms.uNoiseIntensity.value = noiseIntensity;
    uniforms.uColor.value.setRGB(...hexToNormalizedRGB(color));
    uniforms.uRotation.value = rotation;
  }, [speed, scale, noiseIntensity, color, rotation, uniforms]);

  // Minimal context: this is a single opaque 2D quad, so MSAA, alpha,
  // depth, and stencil buy nothing and only cost memory/bandwidth.
  // `failIfMajorPerformanceCaveat: false` is load-bearing on weak GPUs:
  // without it, context creation throws on software-fallback devices and
  // the backdrop would vanish exactly where it is wanted most.
  const glProps = useMemo(
    () => ({
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      failIfMajorPerformanceCaveat: false,
      powerPreference: 'low-power' as const,
    }),
    [],
  );

  const handleCreated = useCallback((state: RootState) => {
    setIsReady(true);
    // If the GPU evicts our context under memory pressure, remount for a
    // clean context instead of leaving a dead (blank) canvas behind.
    const el = state.gl.domElement;
    const onContextLost = (event: Event) => {
      event.preventDefault();
      setIsReady(false);
      setContextEpoch((epoch) => epoch + 1);
    };
    el.addEventListener('webglcontextlost', onContextLost);
  }, []);

  if (!webGLCapable) {
    return (
      <div className={className} style={{ width: '100%', height: '100%', ...style }}>
        <SilkFallback />
      </div>
    );
  }

  return (
    <div className={className} style={{ width: '100%', height: '100%', ...style }}>
      <ErrorBoundary fallback={<SilkFallback />}>
        {/* Static gradient underneath: paints instantly and carries the
            section until the first WebGL frame lands. */}
        {!isReady ? <SilkFallback className="absolute inset-0" /> : null}
        <div
          className="w-full h-full transition-opacity duration-1000 ease-out"
          style={{ opacity: isReady ? 1 : 0 }}
        >
          <Canvas
            key={contextEpoch}
            dpr={dpr}
            gl={glProps}
            flat
            onCreated={handleCreated}
            // Reduced-motion still renders: `demand` paints one static frame
            // on mount instead of `never` (which would leave the layer blank).
            frameloop={prefersReducedMotion ? 'demand' : isVisible ? 'always' : 'never'}
          >
            <SilkPlane ref={meshRef} uniforms={uniforms} />
          </Canvas>
        </div>
      </ErrorBoundary>
    </div>
  );
};

export default Silk;
