// Repro's own stylelint config for the `stylelint` detector (sandbox/bin/repro_tools.py): the
// recommended set, which is likely errors (invalid hex colors, duplicate properties, unknown
// units), not formatting. Passed with --config, so a target's .stylelintrc is never read.
export default {
  extends: ["stylelint-config-recommended"],
  rules: {
    // Fires on ordinary cascade ordering across unrelated selectors; not a defect on its own.
    "no-descending-specificity": null,
  },
};
