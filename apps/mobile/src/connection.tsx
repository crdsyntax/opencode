import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import * as SecureStore from "expo-secure-store"
import { ApiError, Credentials, ModelOption, Opencode } from "./api"

const BASE_URL_KEY = "opencode.baseUrl"
const PASSWORD_KEY = "opencode.password"
const USERNAME_KEY = "opencode.username"
const DEVICE_TOKEN_KEY = "opencode.deviceToken"
const DEVICE_NAME_KEY = "opencode.deviceName"
const DIRECTORY_KEY = "opencode.directory"
const DEVICE_ID_KEY = "opencode.deviceId"
const MODEL_KEY = "opencode.model"
const DEFAULT_SERVER = "http://127.0.0.1:4096"

export type Identity =
  | { readonly kind: "none" }
  | { readonly kind: "password"; readonly username: string; readonly password: string }
  | { readonly kind: "device"; readonly token: string; readonly id: string; readonly name: string }

type ConnectionValue = {
  ready: boolean
  baseUrl: string
  directory: string
  identity: Identity
  client: Opencode | undefined
  error: string | undefined
  model: ModelOption | undefined
  setModel: (model: ModelOption | undefined) => Promise<void>
  setServer: (baseUrl: string, directory: string) => Promise<void>
  signIn: (baseUrl: string, directory: string, username: string, password: string) => Promise<void>
  pair: (baseUrl: string, directory: string, code: string, name: string) => Promise<void>
  signOut: () => Promise<void>
  clientFor: (credentials: Credentials) => Opencode
}

const ConnectionContext = createContext<ConnectionValue | null>(null)

export function ConnectionProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false)
  const [baseUrl, setBaseUrl] = useState(DEFAULT_SERVER)
  const [directory, setDirectory] = useState("")
  const [identity, setIdentity] = useState<Identity>({ kind: "none" })
  const [error, setError] = useState<string | undefined>()
  const [model, setModelState] = useState<ModelOption | undefined>()

  useEffect(() => {
    ;(async () => {
      const [url, password, username, token, name, dir, deviceId, savedModel] = await Promise.all([
        SecureStore.getItemAsync(BASE_URL_KEY),
        SecureStore.getItemAsync(PASSWORD_KEY),
        SecureStore.getItemAsync(USERNAME_KEY),
        SecureStore.getItemAsync(DEVICE_TOKEN_KEY),
        SecureStore.getItemAsync(DEVICE_NAME_KEY),
        SecureStore.getItemAsync(DIRECTORY_KEY),
        SecureStore.getItemAsync(DEVICE_ID_KEY),
        SecureStore.getItemAsync(MODEL_KEY),
      ])
      if (url) setBaseUrl(url)
      if (dir) setDirectory(dir)
      if (savedModel) {
        try {
          setModelState(JSON.parse(savedModel) as ModelOption)
        } catch {
          
        }
      }
      
      if (token) setIdentity({ kind: "device", token, id: deviceId ?? "", name: name ?? "movil" })
      else if (password) setIdentity({ kind: "password", username: username ?? "opencode", password })
      setReady(true)
    })()
  }, [])

  const setServer = useCallback(async (url: string, dir: string) => {
    await Promise.all([SecureStore.setItemAsync(BASE_URL_KEY, url), SecureStore.setItemAsync(DIRECTORY_KEY, dir)])
    setBaseUrl(url)
    setDirectory(dir)
  }, [])

  const signIn = useCallback(async (server: string, dir: string, username: string, password: string) => {
    const client = new Opencode(server, { kind: "password", username, password }, dir)
    const health = await client.health()
    if (!health.data.healthy) throw new Error("El servidor no responde correctamente")
    await Promise.all([
      SecureStore.setItemAsync(BASE_URL_KEY, server),
      SecureStore.setItemAsync(DIRECTORY_KEY, dir),
      SecureStore.setItemAsync(USERNAME_KEY, username),
      SecureStore.setItemAsync(PASSWORD_KEY, password),
    ])
    setBaseUrl(server)
    setDirectory(dir)
    setIdentity({ kind: "password", username, password })
  }, [])

  
  
  const pair = useCallback(async (server: string, dir: string, code: string, name: string) => {
    const client = new Opencode(server, undefined, dir)
    const paired = await client.pair({ code: code.trim().toUpperCase(), name, kind: "mobile", platform: "android" })
    await Promise.all([
      SecureStore.setItemAsync(BASE_URL_KEY, server),
      SecureStore.setItemAsync(DIRECTORY_KEY, dir),
      SecureStore.setItemAsync(DEVICE_TOKEN_KEY, paired.token),
      SecureStore.setItemAsync(DEVICE_ID_KEY, paired.device.id),
      SecureStore.setItemAsync(DEVICE_NAME_KEY, paired.device.name),
    ])
    setBaseUrl(server)
    setDirectory(dir)
    setIdentity({ kind: "device", token: paired.token, id: paired.device.id, name: paired.device.name })
  }, [])

  const signOut = useCallback(async () => {
    await Promise.all([
      SecureStore.deleteItemAsync(PASSWORD_KEY),
      SecureStore.deleteItemAsync(USERNAME_KEY),
      SecureStore.deleteItemAsync(DEVICE_TOKEN_KEY),
      SecureStore.deleteItemAsync(DEVICE_ID_KEY),
      SecureStore.deleteItemAsync(DEVICE_NAME_KEY),
    ])
    setIdentity({ kind: "none" })
  }, [])

  const setModel = useCallback(async (value: ModelOption | undefined) => {
    setModelState(value)
    if (value) await SecureStore.setItemAsync(MODEL_KEY, JSON.stringify(value))
    else await SecureStore.deleteItemAsync(MODEL_KEY)
  }, [])

  const credentials = useMemo<Credentials | undefined>(() => {
    if (identity.kind === "password") return { kind: "password", username: identity.username, password: identity.password }
    if (identity.kind === "device") return { kind: "device", token: identity.token }
    return undefined
  }, [identity])

  const client = useMemo(
    () => (baseUrl && credentials ? new Opencode(baseUrl, credentials, directory) : undefined),
    [baseUrl, credentials, directory],
  )

  const clientFor = useCallback((value: Credentials) => new Opencode(baseUrl, value, directory), [baseUrl, directory])

  useEffect(() => {
    if (!client) return setError(undefined)
    client
      .health()
      .then(() => setError(undefined))
      .catch((cause) =>
        setError(cause instanceof ApiError ? `HTTP ${cause.status}` : "No se pudo contactar con el servidor"),
      )
  }, [client])

  const value: ConnectionValue = {
    ready,
    baseUrl,
    directory,
    identity,
    client,
    error,
    model,
    setModel,
    setServer,
    signIn,
    pair,
    signOut,
    clientFor,
  }

  return <ConnectionContext.Provider value={value}>{children}</ConnectionContext.Provider>
}

export function useConnection() {
  const value = useContext(ConnectionContext)
  if (!value) throw new Error("useConnection must be used inside ConnectionProvider")
  return value
}
