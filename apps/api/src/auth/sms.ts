/** Gửi OTP qua SMS. Thêm nhà cung cấp thật (eSMS, SpeedSMS, Zalo ZNS, Twilio…) bằng cách cài interface này. */
export interface SmsSender {
  readonly name: string;
  send(phoneE164: string, text: string): Promise<void>;
}

/** Chỉ ghi ra log máy chủ — dùng khi chưa có nhà cung cấp SMS. */
export class ConsoleSms implements SmsSender {
  readonly name = "console";
  readonly sent: { phone: string; text: string }[] = [];
  constructor(private log: (msg: string) => void = console.log) {}
  async send(phone: string, text: string) {
    this.sent.push({ phone, text });
    this.log(`[SMS → ${phone}] ${text}`);
  }
}

export function createSmsSender(provider = process.env.SMS_PROVIDER ?? "console"): SmsSender {
  switch (provider) {
    case "console":
      return new ConsoleSms();
    default:
      throw new Error(`SMS_PROVIDER "${provider}" chưa được cài. Hiện chỉ có "console".`);
  }
}
