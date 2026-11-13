import {
  Fn,
  uint,
  float,
  vec2,
  vec3,
  floor,
  min,
  fract,
  mix,
  clamp,
  max,
} from "three/tsl";

// Interpolate scalar samples and derivatives with respect to texture coordinates.

const catmullRom = Fn(({ p0, p1, p2, p3, t }) => {
  const t2 = t.mul(t);
  const t3 = t2.mul(t);

  return float(0.5).mul(
    p1
      .mul(2.0)
      .add(p2.sub(p0).mul(t))
      .add(p0.mul(2.0).sub(p1.mul(5.0)).add(p2.mul(4.0)).sub(p3).mul(t2))
      .add(p0.mul(-1.0).add(p1.mul(3.0)).sub(p2.mul(3.0)).add(p3).mul(t3)),
  );
});

const catmullRomDerivative = Fn(({ p0, p1, p2, p3, t }) => {
  const t2 = t.mul(t);

  return float(0.5).mul(
    p2
      .sub(p0)
      .add(
        p0.mul(4.0).sub(p1.mul(10.0)).add(p2.mul(8.0)).sub(p3.mul(2.0)).mul(t),
      )
      .add(
        p0.mul(-1.0).add(p1.mul(3.0)).sub(p2.mul(3.0)).add(p3).mul(3.0).mul(t2),
      ),
  );
});

const bilinearInterpolation = Fn(
  ({
    index,
    bufferNode,
    sourceWidth,
    sourceHeight,
    sourceChannels,
    texWidth,
    texHeight,
  }) => {
    // Cast once so the rest is less error-prone
    const widthU = uint(sourceWidth);
    const heightU = uint(sourceHeight);
    const channelsU = uint(sourceChannels);
    const texWidthU = uint(texWidth);
    const texHeightU = uint(texHeight);

    // Output texel coordinate
    const posX = index.mod(texWidthU);
    const posY = index.div(texWidthU);

    // Map destination texel centers to source pixel coordinates
    const srcX = clamp(
      float(posX).add(0.5).mul(float(widthU)).div(float(texWidthU)).sub(0.5),
      0.0,
      float(widthU).sub(1.0),
    );

    const srcY = clamp(
      float(posY).add(0.5).mul(float(heightU)).div(float(texHeightU)).sub(0.5),
      0.0,
      float(heightU).sub(1.0),
    );

    // Bilinear neighbors
    const x0 = uint(floor(srcX));
    const y0 = uint(floor(srcY));
    const x1 = min(x0.add(1), widthU.sub(1));
    const y1 = min(y0.add(1), heightU.sub(1));

    const tx = fract(srcX);
    const ty = fract(srcY);

    // Flattened indices into [height, width, channels], channel 0 only
    const idx00 = y0.mul(widthU).add(x0).mul(channelsU);
    const idx10 = y0.mul(widthU).add(x1).mul(channelsU);
    const idx01 = y1.mul(widthU).add(x0).mul(channelsU);
    const idx11 = y1.mul(widthU).add(x1).mul(channelsU);

    const v00 = float(bufferNode.element(idx00));
    const v10 = float(bufferNode.element(idx10));
    const v01 = float(bufferNode.element(idx01));
    const v11 = float(bufferNode.element(idx11));

    // Bilinear interpolation
    const vx0 = mix(v00, v10, tx);
    const vx1 = mix(v01, v11, tx);
    const value = mix(vx0, vx1, ty);

    const dValue_dSrcX = mix(v10.sub(v00), v11.sub(v01), ty);

    const dValue_dSrcY = mix(v01.sub(v00), v11.sub(v10), tx);

    // Convert to normalized destination texture-space derivatives (u, v)
    const derivatives = vec2(
      dValue_dSrcX.mul(float(widthU)),
      dValue_dSrcY.mul(float(heightU)),
    );

    return vec3(value, derivatives);
  },
);

const bicubicInterpolation = Fn(
  ({
    index,
    bufferNode,
    sourceWidth,
    sourceHeight,
    sourceChannels,
    texWidth,
    texHeight,
  }) => {
    const widthU = uint(sourceWidth);
    const heightU = uint(sourceHeight);
    const channelsU = uint(sourceChannels);
    const texWidthU = uint(texWidth);
    const texHeightU = uint(texHeight);

    const posX = index.mod(texWidthU);
    const posY = index.div(texWidthU);

    const srcX = clamp(
      float(posX).add(0.5).mul(float(widthU)).div(float(texWidthU)).sub(0.5),
      0.0,
      float(widthU).sub(1.0),
    );

    const srcY = clamp(
      float(posY).add(0.5).mul(float(heightU)).div(float(texHeightU)).sub(0.5),
      0.0,
      float(heightU).sub(1.0),
    );

    const x1 = uint(floor(srcX));
    const y1 = uint(floor(srcY));
    const x0 = uint(max(float(x1).sub(1), 0));
    const y0 = uint(max(float(y1).sub(1), 0));
    const x2 = min(x1.add(1), widthU.sub(1));
    const y2 = min(y1.add(1), heightU.sub(1));
    const x3 = min(x1.add(2), widthU.sub(1));
    const y3 = min(y1.add(2), heightU.sub(1));

    const tx = fract(srcX);
    const ty = fract(srcY);

    const sample = (x, y) =>
      float(bufferNode.element(y.mul(widthU).add(x).mul(channelsU)));

    const r00 = sample(x0, y0);
    const r01 = sample(x1, y0);
    const r02 = sample(x2, y0);
    const r03 = sample(x3, y0);

    const r10 = sample(x0, y1);
    const r11 = sample(x1, y1);
    const r12 = sample(x2, y1);
    const r13 = sample(x3, y1);

    const r20 = sample(x0, y2);
    const r21 = sample(x1, y2);
    const r22 = sample(x2, y2);
    const r23 = sample(x3, y2);

    const r30 = sample(x0, y3);
    const r31 = sample(x1, y3);
    const r32 = sample(x2, y3);
    const r33 = sample(x3, y3);

    const row0 = catmullRom({ p0: r00, p1: r01, p2: r02, p3: r03, t: tx });
    const row1 = catmullRom({ p0: r10, p1: r11, p2: r12, p3: r13, t: tx });
    const row2 = catmullRom({ p0: r20, p1: r21, p2: r22, p3: r23, t: tx });
    const row3 = catmullRom({ p0: r30, p1: r31, p2: r32, p3: r33, t: tx });

    const dRow0dx = catmullRomDerivative({
      p0: r00,
      p1: r01,
      p2: r02,
      p3: r03,
      t: tx,
    });
    const dRow1dx = catmullRomDerivative({
      p0: r10,
      p1: r11,
      p2: r12,
      p3: r13,
      t: tx,
    });
    const dRow2dx = catmullRomDerivative({
      p0: r20,
      p1: r21,
      p2: r22,
      p3: r23,
      t: tx,
    });
    const dRow3dx = catmullRomDerivative({
      p0: r30,
      p1: r31,
      p2: r32,
      p3: r33,
      t: tx,
    });

    const value = catmullRom({ p0: row0, p1: row1, p2: row2, p3: row3, t: ty });
    const dValue_dSrcX = catmullRom({
      p0: dRow0dx,
      p1: dRow1dx,
      p2: dRow2dx,
      p3: dRow3dx,
      t: ty,
    });
    const dValue_dSrcY = catmullRomDerivative({
      p0: row0,
      p1: row1,
      p2: row2,
      p3: row3,
      t: ty,
    });

    const derivatives = vec2(
      dValue_dSrcX.mul(float(widthU)),
      dValue_dSrcY.mul(float(heightU)),
    );

    return vec3(value, derivatives);
  },
);

export { bilinearInterpolation, bicubicInterpolation };
