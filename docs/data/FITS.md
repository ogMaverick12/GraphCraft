# GraphCraft — Model fitting (Stage 4 DATA-03, hardened S4.4)

Ordinary least squares for lines and bounded-degree polynomials over
dataset columns. The overlay draws on scatter/line plots only — never
on bars or histograms, where a line would imply a false relationship
(the panel says so when suppressed, statistics still computed).

## Models

- **Line**: y = c0 + c1·x.
- **Polynomial**: y = c0 + c1·x + … + cd·x^d, degree 2–6 (capped in
  `MAX_POLY_DEGREE`). Degree ≥ 3 always warns about overfitting.
- **Exponential** (linearized): y = a·e^(b·x), needs y > 0.
- **Logarithmic** (linearized): y = a + b·ln(x), needs x > 0.
- **Power** (linearized): y = a·x^b, needs x > 0 and y > 0.

The nonlinear three solve log-linearized least squares through the
same Householder QR (exp via (x, ln y); log via (ln x, y); power via
(ln x, ln y)) with back-transformed a = e^c0. Out-of-domain points
skip with a count; weights apply in transformed space (stated); R²
and residuals are always in original units. Every nonlinear result
carries an approximation warning and `converged: false` — a valid but
never clean-converged fit, distinct from errors. No universal solver
is claimed; iterative MLE remains deferred.

## Numerical approach

Householder QR on the design matrix (`src/data/fits.ts`), never
normal equations (which square the condition number). Rank failure —
constant X, duplicated structure, exact collinearity — returns a
singular error naming the cause. Conditioning is checked from R's
diagonal ratio and warns below 1e-9. Residual overflow and
non-finite inputs fail loudly. Requirements: at least degree+2
observations (one residual degree of freedom); missing/non-finite
pairs skip with a count.

Weights are genuinely implemented: optional per-observation σ gives
row weight w = 1/σ² (column or fixed value); missing/non-positive σ
excludes the point with a count, mismatched lengths refuse, and R²
stays unweighted on raw residuals (stated in the panel). Plot error
bars NEVER feed the fit — they are display-only by design; only the
Fit panel's σ selector weights, under the identical convention as the
calculator's weighted mean. A UI test pins this independence.

## Reported statistics

- Coefficients c0..cd, labelled estimates with the method note.
- n (observations fitted), dof = n − p (residual degrees of freedom),
  skipped count, residual std (÷dof), RMSE (÷n), MAE (mean|r|),
  min/max residuals, plus a residual plot (zero reference line, own
  zoom) and residual table (first 100 + count) for every successful fit.
- Outlier inspection: rows with |residual| beyond twice the residual
  spread are flagged `large` with the largest |residual| stated — for
  inspection only; nothing is ever removed or down-weighted by the
  panel (weighting stays an explicit σ choice).
- R² = 1 − SSres/SStot; null with an explicit note when Y is constant
  (0/0). R² describes fit, proves nothing: high values do not imply
  causality or model validity (stated in the panel, not in fine print);
  spread figures are likewise descriptive — small errors never prove
  the model right, and no single metric is presented alone.
- No standard errors, confidence intervals, or p-values — unimplemented
  inference is not claimed.

## Plot integration (S4.4)

- Fit uses its own Fit X/Y column selectors; the panel states both the
  fit columns and the plot mapping, and whether they match.
- Curve samples 100 points over the intersection of the fitted data
  range and explicit X bounds (non-positive explicit bounds on log axes
  fall back to data range); non-positive X samples are dropped on log X.
- `DataPlot` maps the overlay through the same log10 transform as
  series points, dropping non-positive/non-finite samples — log views
  can no longer draw the −278k off-screen path. Zoom/clip apply to the
  overlay like any series; legend toggles affect series, the fit follows
  Model=None / error states.
- Datasets remain session-only (project format v4 carries no datasets);
  fit configuration lives in the mounted plot workshop and resets when
  the plot is hidden — stated, not claimed persistent.

## Reuse

Fit results copy as text (equation, n, R², residual std, method,
warnings). The fit configuration lives in the plot workshop, so
reopening a dataset restores the exact setup — nothing to re-enter.
