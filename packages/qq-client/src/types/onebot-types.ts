
export interface Receive {
  [key: string]: any
}

export interface WSSendReturn {
  get_forward_msg: {
    messages: any[]
  }
  [key: string]: any
}
