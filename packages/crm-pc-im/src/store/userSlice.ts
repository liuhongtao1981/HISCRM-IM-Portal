/**
 * Redux 用户状态切片
 */

import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import type { User } from '@shared/types'

interface UserState {
  user: User | null
  websocketUrl: string
  isConnected: boolean
}

const initialState: UserState = {
  user: null,
  websocketUrl: 'ws://localhost:8080',
  isConnected: false
}

const userSlice = createSlice({
  name: 'user',
  initialState,
  reducers: {
    setUser: (state, action: PayloadAction<User>) => {
      state.user = action.payload
    },
    clearUser: (state) => {
      state.user = null
    },
    setWebSocketUrl: (state, action: PayloadAction<string>) => {
      state.websocketUrl = action.payload
    },
    setIsConnected: (state, action: PayloadAction<boolean>) => {
      state.isConnected = action.payload
    }
  }
})

export const { setUser, clearUser, setWebSocketUrl, setIsConnected } = userSlice.actions
export default userSlice.reducer
