import { IElement } from '../interface/Element'
import { IEditorOption } from '../interface/Editor'

// A caller-supplied policy is fail-closed, including thrown validation errors.
export function imageSourceAllowed(options: Pick<IEditorOption, 'imageSourceAllowed'>, element: IElement): boolean {
  try {
    return options.imageSourceAllowed?.(element) !== false
  } catch {
    return false
  }
}
