/**
 * MFRC522 RFID Treiber für Calliope mini 1.x / micro:bit
 */
//% color="#275C6B" weight=100 icon="\uf2bb" block="MFRC522 RFID"
namespace MFRC522 {
    let csPin: DigitalPin = DigitalPin.P1

    const TPrescalerReg = 0x2B
    const TxControlReg = 0x14
    const PICC_READ = 0x30
    const PICC_ANTICOLL = 0x93
    const PCD_RESETPHASE = 0x0F
    const Status2Reg = 0x08
    const CommandReg = 0x01
    const BitFramingReg = 0x0D
    const MAX_LEN = 16
    const PCD_AUTHENT = 0x0E
    const PCD_TRANSCEIVE = 0x0C
    const PICC_REQIDL = 0x26
    const PICC_AUTHENT1A = 0x60

    const ComIrqReg = 0x04
    const DivIrqReg = 0x05
    const FIFODataReg = 0x09
    const FIFOLevelReg = 0x0A
    const ControlReg = 0x0C

    function SetBits(reg: number, mask: number) {
        let tmp = SPI_Read(reg)
        SPI_Write(reg, (tmp | mask))
    }

    function ClearBits(reg: number, mask: number) {
        let tmp = SPI_Read(reg)
        SPI_Write(reg, tmp & (~mask))
    }

    function SPI_Write(adr: number, val: number) {
        pins.digitalWritePin(csPin, 0)
        control.waitMicros(5)
        pins.spiWrite((adr << 1) & 0x7E)
        pins.spiWrite(val)
        control.waitMicros(5)
        pins.digitalWritePin(csPin, 1)
    }

    function SPI_Read(adr: number): number {
        pins.digitalWritePin(csPin, 0)
        control.waitMicros(5)
        pins.spiWrite(((adr << 1) & 0x7E) | 0x80)
        let val = pins.spiWrite(0)
        control.waitMicros(5)
        pins.digitalWritePin(csPin, 1)
        return val
    }

    function AntennaON() {
        let temp = SPI_Read(TxControlReg)
        if ((temp & 0x03) != 0x03) {
            SetBits(TxControlReg, 0x03)
        }
    }

    //% block="Turn off antenna"
    //% weight=80
    export function AntennaOff() {
        ClearBits(TxControlReg, 0x03)
    }

    function MFRC522_ToCard(command: number, sendData: number[]): any[] {
        let returnData: number[] = []
        let returnLen = 0
        let status = 2
        let irqEN = 0x00
        let waitIRQ = 0x00
        let lastBits = 0
        let n = 0

        if (command == PCD_AUTHENT) {
            irqEN = 0x12
            waitIRQ = 0x10
        }

        if (command == PCD_TRANSCEIVE) {
            irqEN = 0x77
            waitIRQ = 0x30
        }

        SPI_Write(0x02, irqEN | 0x80)
        ClearBits(ComIrqReg, 0x80)
        SetBits(FIFOLevelReg, 0x80)
        SPI_Write(CommandReg, 0) // PCD_IDLE

        for (let o = 0; o < sendData.length; o++) {
            SPI_Write(FIFODataReg, sendData[o])
        }
        SPI_Write(CommandReg, command)

        if (command == PCD_TRANSCEIVE) {
            SetBits(BitFramingReg, 0x80)
        }

        let p = 2000
        while (p > 0) {
            n = SPI_Read(ComIrqReg)
            p--
            if ((n & 0x01) || (n & waitIRQ)) {
                break
            }
        }
        ClearBits(BitFramingReg, 0x80)

        if (p != 0) {
            if ((SPI_Read(0x06) & 0x1B) == 0x00) {
                status = 0
                if (n & irqEN & 0x01) {
                    status = 1
                }
                if (command == PCD_TRANSCEIVE) {
                    n = SPI_Read(FIFOLevelReg)
                    lastBits = SPI_Read(ControlReg) & 0x07
                    if (lastBits != 0) {
                        returnLen = (n - 1) * 8 + lastBits
                    } else {
                        returnLen = n * 8
                    }

                    if (n == 0) n = 1
                    if (n > MAX_LEN) n = MAX_LEN

                    for (let q = 0; q < n; q++) {
                        returnData.push(SPI_Read(FIFODataReg))
                    }
                }
            } else {
                status = 2
            }
        }

        return [status, returnData, returnLen]
    }

    function Request(reqMode: number): any[] {
        SPI_Write(BitFramingReg, 0x07)
        let Type = [reqMode]
        let res = MFRC522_ToCard(PCD_TRANSCEIVE, Type)
        let status = res[0]
        let returnBits = res[2]

        if ((status != 0) || (returnBits != 16)) {
            status = 2
        }

        return [status, returnBits]
    }

    function AvoidColl(): any[] {
        let SerNum = [PICC_ANTICOLL, 0x20]
        let ChkSerNum = 0
        SPI_Write(BitFramingReg, 0)
        
        let res = MFRC522_ToCard(PCD_TRANSCEIVE, SerNum)
        let status = res[0]
        let returnData: number[] = res[1]

        if (status == 0) {
            if (returnData && returnData.length == 5) {
                for (let k = 0; k <= 3; k++) {
                    ChkSerNum = ChkSerNum ^ returnData[k]
                }
                if (ChkSerNum != returnData[4]) {
                    status = 2
                }
            } else {
                status = 2
            }
        }
        return [status, returnData]
    }

    function getIDNum(uid: number[]): number {
        if (!uid || uid.length < 4) return 0
        return ((uid[0] << 24) >>> 0) + (uid[1] << 16) + (uid[2] << 8) + uid[3]
    }

    /*
     * Initialisierung des MFRC522-Moduls
     */
    //% block="Initialize MFRC522 Module CS %cs"
    //% weight=100
    export function Init(cs: DigitalPin = DigitalPin.P1) {
        csPin = cs
        // SPI Hardware-Pins für Calliope 1.x
        pins.spiPins(DigitalPin.P15, DigitalPin.P14, DigitalPin.P13)
        pins.spiFormat(8, 0)
        // Gedrosselte SPI-Frequenz (125 kHz), um Pegelprobleme mit der Display-Matrix zu vermeiden
        pins.spiFrequency(125000)

        pins.digitalWritePin(csPin, 1)
        control.waitMicros(50)

        // Soft-Reset des MFRC522
        SPI_Write(CommandReg, PCD_RESETPHASE)
        control.waitMicros(1000)

        // Timer und Antenne einrichten
        SPI_Write(0x2A, 0x8D)
        SPI_Write(0x2B, 0x3E)
        SPI_Write(0x2D, 30)
        SPI_Write(0x2E, 0)
        SPI_Write(0x15, 0x40)
        SPI_Write(0x11, 0x3D)
        AntennaON()
    }

    /*
     * Liest die Firmware-Version des MFRC522 aus Register 0x37
     */
    //% block="Get Firmware Version"
    //% weight=96
    export function getFirmwareVersion(): number {
        return SPI_Read(0x37)
    }

    /*
     * Nicht-blockierende, crash-sichere ID-Abfrage
     */
    //% block="Read ID (non-blocking)"
    //% weight=95
    export function getIDwithoutBlocking(): number {
        let req = Request(PICC_REQIDL)
        if (!req || req[0] != 0) {
            return 0
        }

        let coll = AvoidColl()
        if (!coll || coll[0] != 0) {
            return 0
        }

        let uid: number[] = coll[1]
        if (!uid || uid.length < 4) {
            return 0
        }

        return getIDNum(uid)
    }

    //% block="Read ID"
    //% weight=94
    export function getID(): number {
        return getIDwithout
