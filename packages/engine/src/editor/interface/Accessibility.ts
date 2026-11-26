export interface IAccessibilityOption {
  disabled?: boolean
  /**
   * Keep an off-screen DOM copy of the main text (paragraphs, headings, lists
   * and tables) for screen readers, and mark the paragraph holding the caret
   * with aria-current. Needs `disabled: false`.
   */
  textMirror?: boolean
}
