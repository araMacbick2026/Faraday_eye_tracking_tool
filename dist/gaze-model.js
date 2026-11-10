(function (root) {
  'use strict';

  const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
  const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
  const median = values => {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = (sorted.length - 1) / 2;
    return (sorted[Math.floor(middle)] + sorted[Math.ceil(middle)]) / 2;
  };

  // Solve a positive definite ridge system for both screen axes at once.
  function solve(matrix, targets) {
    const lower = matrix.map(row => row.map(() => 0));
    for (let i = 0; i < matrix.length; i++) {
      for (let j = 0; j <= i; j++) {
        let value = matrix[i][j];
        for (let k = 0; k < j; k++) value -= lower[i][k] * lower[j][k];
        lower[i][j] = i === j ? Math.sqrt(value) : value / lower[j][j];
      }
    }
    const result = targets.map(row => [...row]);
    for (let i = 0; i < result.length; i++) {
      for (let j = 0; j < i; j++) {
        result[i][0] -= lower[i][j] * result[j][0];
        result[i][1] -= lower[i][j] * result[j][1];
      }
      result[i][0] /= lower[i][i];
      result[i][1] /= lower[i][i];
    }
    for (let i = result.length - 1; i >= 0; i--) {
      for (let j = i + 1; j < result.length; j++) {
        result[i][0] -= lower[j][i] * result[j][0];
        result[i][1] -= lower[j][i] * result[j][1];
      }
      result[i][0] /= lower[i][i];
      result[i][1] /= lower[i][i];
    }
    return result;
  }

  function fitTargets(targets, strength) {
    const center = targets[0].features.map((_, i) => mean(targets.map(target => target.features[i])));
    const centerFeatures = features => features.map((value, i) => value - center[i]);
    const vectors = targets.map(target => centerFeatures(target.features));
    const offset = [0, 1].map(i => mean(targets.map(target => target.point[i])));
    const positions = targets.map(target => target.point.map((value, i) => value - offset[i]));
    const variance = mean(vectors.map(vector => dot(vector, vector)));
    const penalty = Math.max(1e-8, variance * strength);
    const matrix = vectors.map((a, i) => vectors.map((b, j) => dot(a, b) + (i === j ? penalty : 0)));
    const weights = solve(matrix, positions);
    const axes = offset.map((_, axis) => center.map((_, i) =>
      weights.reduce((sum, row, j) => sum + row[axis] * vectors[j][i], 0)));
    return features => {
      const vector = centerFeatures(features);
      return { x: offset[0] + dot(vector, axes[0]), y: offset[1] + dot(vector, axes[1]) };
    };
  }

  function create(extract, capacity, minimumTargets = 6) {
    let groups, predict, count, featureCount, calibrationError;
    const readFeatures = patches => {
      try { return extract(patches) ?? []; } catch { return []; }
    };
    const model = {
      name: 'faraday-centered-ridge',
      init() { groups = new Map(); predict = null; count = 0; featureCount = 0; calibrationError = null; },
      get sampleCount() { return count; },
      get calibrationError() { return calibrationError; },
      getData() { return []; }, // WebGazer may request data during a model change. Eye features stay in memory.
      setData() {},
      addData(patches, point, type) {
        if (type !== 'faraday-calibration' || !patches || count >= capacity) return false;
        const features = readFeatures(patches);
        if (!features.length || !features.every(Number.isFinite) || (featureCount && featureCount !== features.length)) return false;
        featureCount = features.length;
        const key = point.join(',');
        if (!groups.has(key)) groups.set(key, { point, samples: [] });
        groups.get(key).samples.push(features);
        count++;
        return true;
      },
      fit(requiredTargets = minimumTargets) {
        const targets = [...groups.values()].map(({ point, samples }) => ({
          point, features: samples[0].map((_, i) => median(samples.map(sample => sample[i])))
        }));
        if (targets.length < requiredTargets) return false;
        // Tune only on calibration targets. The separate accuracy checks never feed the model.
        const candidates = [0.01, 0.1, 1];
        let bestStrength = candidates[0], bestLoss = Infinity;
        for (const strength of candidates) {
          const loss = mean(targets.map((target, i) => {
            const estimate = fitTargets(targets.filter((_, j) => i !== j), strength)(target.features);
            return Math.hypot(estimate.x - target.point[0], estimate.y - target.point[1]);
          }));
          if (loss < bestLoss) { bestLoss = loss; bestStrength = strength; }
        }
        predict = fitTargets(targets, bestStrength);
        calibrationError = bestLoss;
        return true;
      },
      predict(patches) {
        if (!predict || !patches) return null;
        const features = readFeatures(patches);
        if (features.length !== featureCount || !features.every(Number.isFinite)) return null;
        const point = predict(features);
        return Number.isFinite(point.x) && Number.isFinite(point.y) ? point : null;
      }
    };
    model.init();
    return model;
  }

  function irisFeatures(landmarks) {
    if (!landmarks?.[473]) return undefined;
    const features = [];
    // The iris center is measured in the eye's own coordinate system, using its corners as anchors.
    for (const [left, right, top, bottom, center] of [[33, 133, 159, 145, 468], [362, 263, 386, 374, 473]]) {
      const points = [left, right, top, bottom, center].map(index => landmarks[index]);
      if (points.some(point => !point || !Number.isFinite(point[0]) || !Number.isFinite(point[1]))) return null;
      const [a, b, upper, lower, iris] = points;
      const dx = b[0] - a[0], dy = b[1] - a[1], lengthSquared = dx * dx + dy * dy;
      if (lengthSquared < 64) return null;
      const vertical = (x, y) => (dx * y - dy * x) / lengthSquared;
      const opening = vertical(lower[0] - upper[0], lower[1] - upper[1]);
      if (Math.abs(opening) < 0.08) return null;
      const x = iris[0] - a[0], y = iris[1] - a[1];
      features.push((x * dx + y * dy) / lengthSquared, vertical(x, y));
    }
    return features;
  }

  function createAdaptive(extractPatches, capacity, targetCount) {
    const patchesModel = create(extractPatches, capacity, targetCount);
    const irisModel = create(patches => patches.faradayIris, capacity, targetCount);
    let active = null;
    return {
      name: 'faraday-adaptive-ridge',
      get source() { return active === irisModel ? 'iris' : 'eye-patches'; },
      get sampleCount() { return active?.sampleCount ?? patchesModel.sampleCount; },
      get calibrationError() { return active?.calibrationError ?? null; },
      init() { patchesModel.init(); irisModel.init(); active = null; },
      getData() { return []; },
      setData() {},
      addData(patches, point, type) {
        if (!patches || patches.faradayIris === null) return false;
        const pixelAccepted = patchesModel.addData(patches, point, type);
        const irisAccepted = irisModel.addData(patches, point, type);
        return pixelAccepted || irisAccepted;
      },
      fit(requiredTargets = targetCount) {
        const pixelsReady = patchesModel.fit(requiredTargets);
        const irisReady = irisModel.fit(requiredTargets);
        // Prefer iris geometry if held-out calibration targets score comparably. Neither model sees accuracy-check targets.
        active = irisReady && (!pixelsReady || irisModel.calibrationError <= patchesModel.calibrationError * 1.1)
          ? irisModel : pixelsReady ? patchesModel : null;
        return active !== null;
      },
      predict(patches) {
        if (!patches || patches.faradayIris === null) return null;
        return active?.predict(patches) ?? null;
      }
    };
  }

  root.GazeModel = { create, createAdaptive, irisFeatures };
})(typeof window === 'undefined' ? globalThis : window);
