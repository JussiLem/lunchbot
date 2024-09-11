import { CustomSlot } from './customSlot'

export interface LunchState {
  sessionId: string
  slot: CustomSlot
  slotValue: { [key: string]: string }
  expireAt: number
}

export interface Lunch {
  sessionId: string
  slot: CustomSlot
  restaurant?: string
  officeLocation?: string
  expireAt: number
}
