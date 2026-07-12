/** Return the visual properties a new topic inherits from its source topic. */
export function inheritedNodeStyle(source, sourceLabel) {
  return {
    shape: {
      backgroundColor: source.backgroundColor,
      strokeColor: source.strokeColor,
      fillStyle: source.fillStyle,
      strokeWidth: source.strokeWidth,
      strokeStyle: source.strokeStyle,
      roughness: source.roughness,
      opacity: source.opacity,
      roundness: source.roundness,
    },
    label: sourceLabel ? {
      fontFamily: sourceLabel.fontFamily,
      fontSize: sourceLabel.fontSize,
      strokeColor: sourceLabel.strokeColor,
      textAlign: sourceLabel.textAlign,
      verticalAlign: sourceLabel.verticalAlign,
      opacity: sourceLabel.opacity,
    } : {},
  };
}
