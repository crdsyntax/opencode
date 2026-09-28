import { describe, expect, test } from "bun:test"
import { pairingTargets } from "./device-handoff"

describe("pairingTargets", () => {
  test("sustituye el host por cada direccion LAN conservando el puerto", () => {
    expect(
      pairingTargets({ url: "http://127.0.0.1:52341", password: "p" }, ["192.168.1.42", "10.0.0.7"]),
    ).toEqual(["http://192.168.1.42:52341", "http://10.0.0.7:52341"])
  })

  test("descarta loopback, porque en el telefono apunta al telefono", () => {
    expect(
      pairingTargets({ url: "http://127.0.0.1:52341" }, ["127.0.0.1", "localhost", "::1", "192.168.0.5"]),
    ).toEqual(["http://192.168.0.5:52341"])
  })

  test("tolera direcciones ausentes o vacias", () => {
    expect(pairingTargets({ url: "http://127.0.0.1:9000" }, undefined)).toEqual([])
    expect(pairingTargets({ url: "http://127.0.0.1:9000" }, [])).toEqual([])
    expect(pairingTargets({ url: "http://127.0.0.1:9000" }, ["", "192.168.0.5"])).toEqual(["http://192.168.0.5:9000"])
  })

  test("respeta el esquema y el puerto explicito de un servidor remoto", () => {
    expect(pairingTargets({ url: "https://code.example.com:8443" }, ["192.168.0.5"])).toEqual([
      "https://192.168.0.5:8443",
    ])
  })

  test("deduce el puerto por defecto cuando la URL no lo trae", () => {
    expect(pairingTargets({ url: "http://127.0.0.1" }, ["192.168.0.5"])).toEqual(["http://192.168.0.5:80"])
    expect(pairingTargets({ url: "https://127.0.0.1" }, ["192.168.0.5"])).toEqual(["https://192.168.0.5:443"])
  })

  test("no inventa nada con una URL que no se puede parsear", () => {
    expect(pairingTargets({ url: "no-es-una-url" }, ["192.168.0.5"])).toEqual([])
  })

  test("tolera barras finales", () => {
    expect(pairingTargets({ url: "http://127.0.0.1:52341/" }, ["192.168.1.42"])).toEqual([
      "http://192.168.1.42:52341",
    ])
  })
})
