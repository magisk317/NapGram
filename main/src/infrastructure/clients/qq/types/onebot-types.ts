/**
 * Temporary local definition of OneBot types to replace node-napcat-ts dependency.
 * These should eventually be exported by NapLink.
 */

export interface Receive {
  [key: string]: any
}

export interface WSSendReturn {
  get_forward_msg: {
    messages: any[]
  }
  [key: string]: any
}
