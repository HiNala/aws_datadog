"use client";

import type React from "react";
import { Renderer, Program, Mesh, Color, Triangle } from "ogl";
import { useEffect, useRef } from "react";

interface IridescenceProps extends React.HTMLAttributes<HTMLDivElement> {
  color?: [number, number, number];
  speed?: number;
  amplitude?: number;
  mouseReact?: boolean;
  audioLevel?: number;
  behaviorMode?: number;
  responseIntensity?: number;
  haloIntensity?: number;
}

const vertexShader = `
attribute vec2 uv;
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0, 1);
}
`;

const fragmentShader = `
precision highp float;

uniform float uTime;
uniform vec3 uColor;
uniform vec3 uResolution;
uniform vec2 uMouse;
uniform float uAmplitude;
uniform float uSpeed;
uniform float uAudioLevel;
uniform float uBehaviorMode;
uniform float uResponseIntensity;
uniform float uHaloIntensity;

varying vec2 vUv;

float noise(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

float smoothNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = noise(i);
  float b = noise(i + vec2(1.0, 0.0));
  float c = noise(i + vec2(0.0, 1.0));
  float d = noise(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
  float mr = min(uResolution.x, uResolution.y);
  vec2 uv = (vUv.xy * 2.0 - 1.0) * uResolution.xy / mr;
  float time = uTime * uSpeed;
  vec2 waveUv = uv;
  float dist = length(uv);

  if (uBehaviorMode < 0.5) {
    float breathe = sin(time * 0.8) * 0.12 + sin(time * 0.3) * 0.06;
    float breathe3D = cos(time * 0.5 + dist * 2.0) * 0.08;
    waveUv += uv * (breathe + breathe3D);
    float angle = atan(uv.y, uv.x);
    float radius = length(uv);
    float gentleSpiral = sin(angle * 2.0 + time * 0.5 + radius * 2.0) * 0.18;
    float depthSpiral = cos(angle * 3.0 - time * 0.3 + radius * 1.5) * 0.12;
    waveUv += vec2(cos(angle + 1.57), sin(angle + 1.57)) * (gentleSpiral + depthSpiral);
    waveUv.x += sin(time * 0.4 + uv.y * 1.5 + dist * 3.0) * 0.22;
    waveUv.y += cos(time * 0.3 + uv.x * 1.2 + dist * 2.5) * 0.20;
  } else if (uBehaviorMode < 1.5) {
    float audioInfluence = uAudioLevel * 5.0;
    for(float i = 1.0; i <= 6.0; i++) {
      float ripple = sin(dist * 5.0 * i - time * 4.0 - audioInfluence * 8.0) * (audioInfluence * 0.4);
      float ripple3D = cos(dist * 6.0 * i + time * 3.0 + audioInfluence * 6.0) * (audioInfluence * 0.3);
      vec2 rippleDir = normalize(uv + vec2(sin(time * 0.5), cos(time * 0.3)));
      waveUv += rippleDir * (ripple + ripple3D) / i;
    }
    float angle = atan(uv.y, uv.x);
    float radius = length(uv);
    float energeticSpiral = sin(angle * 3.0 + time * 2.0 + radius * 4.0 + audioInfluence * 3.0) * (0.35 + audioInfluence * 0.6);
    float depthSpiral = cos(angle * 4.0 - time * 1.5 + radius * 3.0 + audioInfluence * 2.5) * (0.25 + audioInfluence * 0.4);
    waveUv += vec2(cos(angle + 0.5), sin(angle + 0.5)) * (energeticSpiral + depthSpiral);
    waveUv.x += sin(time * 1.5 + uv.y * 6.0 + audioInfluence * 4.0 + dist * 4.0) * (0.25 + audioInfluence * 0.5);
    waveUv.y += cos(time * 1.2 + uv.x * 5.0 + audioInfluence * 3.5 + dist * 3.5) * (0.22 + audioInfluence * 0.45);
  } else {
    float speechRhythm = uResponseIntensity;
    float speechPulse = sin(time * 3.0) * sin(time * 3.0) * speechRhythm;
    float speechPulse2 = cos(time * 4.5) * cos(time * 4.5) * speechRhythm * 0.7;
    float speechPulse3D = sin(time * 2.5 + dist * 5.0) * speechRhythm * 0.5;
    waveUv += uv * (speechPulse + speechPulse2 + speechPulse3D) * 0.18;
    float angle = atan(uv.y, uv.x);
    float radius = length(uv);
    float speechWave1 = sin(angle * 4.0 + time * 2.5 + radius * 6.0) * speechRhythm * 0.45;
    float speechWave2 = cos(angle * 6.0 - time * 3.2 + radius * 4.0) * speechRhythm * 0.35;
    float speechWave3 = sin(angle * 8.0 + time * 1.8 + radius * 8.0) * speechRhythm * 0.25;
    float speechWave3D = cos(angle * 5.0 + time * 2.8 + dist * 7.0) * speechRhythm * 0.3;
    waveUv += vec2(cos(angle + 0.8), sin(angle + 0.8)) * (speechWave1 + speechWave2 + speechWave3 + speechWave3D);
    waveUv.x += sin(time * 2.2 + uv.y * 8.0 + dist * 6.0) * speechRhythm * 0.4;
    waveUv.y += cos(time * 1.8 + uv.x * 7.0 + dist * 5.5) * speechRhythm * 0.37;
    waveUv.x += sin(time * 8.0 + uv.y * 15.0 + dist * 10.0) * speechRhythm * 0.1;
    waveUv.y += cos(time * 7.5 + uv.x * 12.0 + dist * 9.0) * speechRhythm * 0.09;
  }

  float d = -time * 0.5;
  float a = 0.0;

  float complexity = 1.0;
  if (uBehaviorMode < 0.5) {
    complexity = 0.8;
  } else if (uBehaviorMode < 1.5) {
    complexity = 1.0 + uAudioLevel * 2.0;
  } else {
    complexity = 1.2 + uResponseIntensity * 1.5;
  }

  for (float i = 0.0; i < 18.0; ++i) {
    float behaviorOffset = 0.0;
    float depthOffset = sin(time * 0.2 + i * 0.5 + dist * 3.0) * 0.3;
    if (uBehaviorMode < 0.5) {
      behaviorOffset = sin(time * 0.1 + i * 0.4) * 0.5 + depthOffset;
    } else if (uBehaviorMode < 1.5) {
      behaviorOffset = sin(time * 0.2 + i * 0.6) * uAudioLevel * 3.0 + depthOffset;
    } else {
      behaviorOffset = sin(time * 0.3 + i * 0.8) * uResponseIntensity * 2.5 + depthOffset;
    }
    float avoidCenter = 1.0 / (1.0 + dist * 2.0);
    a += cos(i - d - a * waveUv.x * complexity + behaviorOffset) * (1.0 - avoidCenter * 0.5);
    d += sin(waveUv.y * i * complexity + a + behaviorOffset * 0.8) * (1.0 - avoidCenter * 0.3);
    float spiralMotion = atan(waveUv.y, waveUv.x) * (2.0 + i * 0.2) + time * 0.4 + behaviorOffset * 2.0;
    a += sin(spiralMotion + i + dist * 2.0) * (0.12 + complexity * 0.1);
  }

  d += time * 0.5;

  vec3 col = vec3(
    cos(waveUv * vec2(d, a)) * (0.4 + dist * 0.2) + 0.6,
    cos(a + d + time * 0.4 + dist * 1.5) * (0.3 + dist * 0.15) + 0.7
  );

  float gradientFactor = (sin(waveUv.x * 2.0 + time * 0.3) + cos(waveUv.y * 1.8 + time * 0.4)) * 0.5 + 0.5;
  gradientFactor += smoothNoise(waveUv * 3.0 + time * 0.5) * 0.3;

  if (uBehaviorMode < 0.5) {
    gradientFactor = mix(gradientFactor, 0.25, 0.6);
  } else if (uBehaviorMode < 1.5) {
    gradientFactor = mix(gradientFactor, mix(0.25, uAudioLevel, 0.8), 0.7);
  } else {
    gradientFactor = mix(gradientFactor, 0.75, 0.5);
    gradientFactor += sin(time * 2.0) * uResponseIntensity * 0.2;
  }

  vec3 deepBlue = vec3(0.05, 0.2, 0.7);
  vec3 blue = vec3(0.15, 0.4, 0.9);
  vec3 lightBlue = vec3(0.3, 0.6, 1.0);
  vec3 cyan = vec3(0.2, 0.8, 1.0);
  vec3 purple = vec3(0.5, 0.3, 0.9);
  vec3 magenta = vec3(0.8, 0.2, 0.8);
  vec3 pink = vec3(1.0, 0.3, 0.7);
  vec3 lightPink = vec3(1.0, 0.5, 0.8);

  vec3 baseColor;
  float smoothStep = smoothstep(0.0, 1.0, gradientFactor);

  if(smoothStep < 0.14) {
    baseColor = mix(deepBlue, blue, smoothStep * 7.0);
  } else if(smoothStep < 0.28) {
    baseColor = mix(blue, lightBlue, (smoothStep - 0.14) * 7.0);
  } else if(smoothStep < 0.42) {
    baseColor = mix(lightBlue, cyan, (smoothStep - 0.28) * 7.0);
  } else if(smoothStep < 0.56) {
    baseColor = mix(cyan, purple, (smoothStep - 0.42) * 7.0);
  } else if(smoothStep < 0.70) {
    baseColor = mix(purple, magenta, (smoothStep - 0.56) * 7.0);
  } else if(smoothStep < 0.84) {
    baseColor = mix(magenta, pink, (smoothStep - 0.70) * 7.0);
  } else {
    baseColor = mix(pink, lightPink, (smoothStep - 0.84) * 6.25);
  }

  float colorSwirl = sin(time * 0.2 + length(waveUv) * 4.0) * 0.4 + 0.6;
  float depth3D = 1.0 - dist * 0.3;

  col = mix(
    baseColor * (0.7 + depth3D * 0.3),
    baseColor * (1.4 - depth3D * 0.2),
    cos(col * cos(vec3(d, a, 2.0 + colorSwirl)) * 0.6 + 0.4)
  ) * uColor;

  float brightness = 0.8 + depth3D * 0.3;
  if (uBehaviorMode < 0.5) {
    brightness = (0.6 + depth3D * 0.2) + sin(time * 0.5) * 0.1;
  } else if (uBehaviorMode < 1.5) {
    brightness = (0.7 + depth3D * 0.3) + uAudioLevel * 0.6;
  } else {
    brightness = (0.8 + depth3D * 0.4) + uResponseIntensity * 0.5 + sin(time * 3.0) * uResponseIntensity * 0.2;
  }
  brightness += uHaloIntensity * 0.3;
  col *= brightness;

  float microPulse = 1.0;
  if (uBehaviorMode < 0.5) {
    microPulse = sin(time * 1.2 + dist * 2.0) * 0.06 + 0.97;
  } else if (uBehaviorMode < 1.5) {
    microPulse = sin(time * 2.0 + uAudioLevel * 6.0 + dist * 3.0) * (0.1 + uAudioLevel * 0.2) + 0.94;
  } else {
    microPulse = sin(time * 4.0 + dist * 4.0) * sin(time * 4.0) * uResponseIntensity * 0.18 + 0.91;
  }
  col *= microPulse;

  float rimLight = pow(1.0 - dist, 2.0) * 0.3 + 0.7;
  col *= rimLight;

  gl_FragColor = vec4(col, 1.0);
}
`;

export const Iridescence: React.FC<IridescenceProps> = ({
  color = [1, 1, 1],
  speed = 1.0,
  amplitude = 0.1,
  mouseReact = true,
  audioLevel = 0,
  behaviorMode = 0,
  responseIntensity = 0.7,
  haloIntensity = 0.3,
  className,
  style,
  ...rest
}) => {
  const ctnDom = useRef<HTMLDivElement>(null);
  const mousePos = useRef({ x: 0.5, y: 0.5 });
  const rendererRef = useRef<Renderer | null>(null);
  const programRef = useRef<Program | null>(null);

  useEffect(() => {
    if (!ctnDom.current) return;

    const ctn = ctnDom.current;
    const renderer = new Renderer({
      dpr: Math.min(window.devicePixelRatio, 2),
      antialias: true,
    });
    rendererRef.current = renderer;

    const gl = renderer.gl;
    gl.clearColor(1, 1, 1, 0);

    let program: Program;

    function resize() {
      if (!ctnDom.current || !rendererRef.current) return;
      rendererRef.current.setSize(
        ctnDom.current.offsetWidth,
        ctnDom.current.offsetHeight
      );
      if (program) {
        program.uniforms.uResolution.value = new Color(
          gl.canvas.width,
          gl.canvas.height,
          gl.canvas.width / gl.canvas.height
        );
      }
    }

    window.addEventListener("resize", resize, false);

    const geometry = new Triangle(gl);

    program = new Program(gl, {
      vertex: vertexShader,
      fragment: fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new Color(...color) },
        uResolution: {
          value: new Color(
            ctn.offsetWidth,
            ctn.offsetHeight,
            ctn.offsetWidth / ctn.offsetHeight
          ),
        },
        uMouse: {
          value: new Float32Array([mousePos.current.x, mousePos.current.y]),
        },
        uAmplitude: { value: amplitude },
        uSpeed: { value: speed },
        uAudioLevel: { value: audioLevel },
        uBehaviorMode: { value: behaviorMode },
        uResponseIntensity: { value: responseIntensity },
        uHaloIntensity: { value: haloIntensity },
      },
    });

    programRef.current = program;
    resize();

    const mesh = new Mesh(gl, { geometry, program });

    let animateId: number;

    function update(t: number) {
      animateId = requestAnimationFrame(update);
      program.uniforms.uTime.value = t * 0.001;
      program.uniforms.uMouse.value[0] = 0.5;
      program.uniforms.uMouse.value[1] = 0.5;
      renderer.render({ scene: mesh });
    }

    animateId = requestAnimationFrame(update);
    ctn.appendChild(gl.canvas);

    gl.canvas.style.width = "100%";
    gl.canvas.style.height = "100%";
    gl.canvas.style.display = "block";

    function handleMouseMove(e: MouseEvent) {
      if (!ctnDom.current) return;
      const rect = ctnDom.current.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = 1.0 - (e.clientY - rect.top) / rect.height;
      mousePos.current = { x, y };
    }

    if (mouseReact) {
      ctn.addEventListener("mousemove", handleMouseMove);
    }

    return () => {
      cancelAnimationFrame(animateId);
      window.removeEventListener("resize", resize);
      if (mouseReact) {
        ctn.removeEventListener("mousemove", handleMouseMove);
      }
      const currentRenderer = rendererRef.current;
      if (currentRenderer) {
        const currentGl = currentRenderer.gl;
        if (currentGl && currentGl.canvas && ctn.contains(currentGl.canvas)) {
          ctn.removeChild(currentGl.canvas);
        }
        const loseContextExtension = currentGl.getExtension("WEBGL_lose_context");
        if (loseContextExtension) {
          loseContextExtension.loseContext();
        }
      }
      rendererRef.current = null;
      programRef.current = null;
    };
  }, [color, speed, amplitude, mouseReact]);

  useEffect(() => {
    if (programRef.current) {
      const timeoutId = setTimeout(() => {
        if (programRef.current) {
          programRef.current.uniforms.uAudioLevel.value = audioLevel;
          programRef.current.uniforms.uBehaviorMode.value = behaviorMode;
          programRef.current.uniforms.uResponseIntensity.value = responseIntensity;
          programRef.current.uniforms.uHaloIntensity.value = haloIntensity;
        }
      }, 16);
      return () => clearTimeout(timeoutId);
    }
  }, [audioLevel, behaviorMode, responseIntensity, haloIntensity]);

  return <div ref={ctnDom} className={className} style={style} {...rest} />;
};
