import { MaxHeightRatio } from '../enum/Common'

// Runtime paragraph sentinel. U+200B is valid document text and must never
// double as structural syntax. NUL is not valid saved document text.
export const ZERO = '\u0000'
export const WRAP = '\n'
export const HORIZON_TAB = '\t'
export const NBSP = '\u0020'
export const NON_BREAKING_SPACE = '&nbsp;'
export const PUNCTUATION_LIST = [
  '·',
  '、',
  ':',
  '：',
  ',',
  '，',
  '.',
  '。',
  ';',
  '；',
  '?',
  '？',
  '!',
  '！'
]

export const maxHeightRadioMapping: Record<MaxHeightRatio, number> = {
  [MaxHeightRatio.HALF]: 1 / 2,
  [MaxHeightRatio.ONE_THIRD]: 1 / 3,
  [MaxHeightRatio.QUARTER]: 1 / 4
}

export const LETTER_CLASS = {
  ENGLISH: 'A-Za-z',
  SPANISH: 'A-Za-zÁÉÍÓÚáéíóúÑñÜü',
  FRENCH: 'A-Za-zÀÂÇàâçÉéÈèÊêËëÎîÏïÔôÙùÛûŸÿ',
  GERMAN: 'A-Za-zÄäÖöÜüß',
  RUSSIAN: 'А-Яа-яЁё',
  PORTUGUESE: 'A-Za-zÁÉÍÓÚáéíóúÃÕãõÇç',
  ITALIAN: 'A-Za-zÀàÈèÉéÌìÍíÎîÓóÒòÙù',
  DUTCH: 'A-Za-zÀàÁáÂâÄäÈèÉéÊêËëÌìÍíÎîÏïÓóÒòÔôÖöÙùÛûÜü',
  SWEDISH: 'A-Za-zÅåÄäÖö',
  GREEK: 'ΑαΒβΓγΔδΕεΖζΗηΘθΙιΚκΛλΜμΝνΞξΟοΠπΡρΣσςΤτΥυΦφΧχΨψΩω'
}

export const METRICS_BASIS_TEXT = '中'
