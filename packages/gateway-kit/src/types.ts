export type GatewayPairRecord = {
  id: number
  qqRoomId: string | number | bigint
  tgChatId: string | number | bigint
  tgThreadId?: number | null
}

export type GatewayPairsProvider = {
  getAll: () => GatewayPairRecord[]
}
