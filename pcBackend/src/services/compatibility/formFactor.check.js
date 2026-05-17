const parse = (v) => (Array.isArray(v) ? v : JSON.parse(v || '[]'));

const check = (mainboard, pcCase) => {
  const supported = parse(pcCase.supported_form_factors);

  if (!supported.includes(mainboard.form_factor)) {
    return {
      ok: false,
      error: `Case does not support ${mainboard.form_factor}. Supported form factors: [${supported.join(', ')}]`,
    };
  }

  return { ok: true };
};

module.exports = check;