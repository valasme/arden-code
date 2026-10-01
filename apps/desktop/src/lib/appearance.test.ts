import { interfaceScale } from "./appearance";

describe("interfaceScale", () => {
  it("is the zoom when the Windows text size is normal", () => {
    expect(interfaceScale({ zoom: 100, followTextSize: true }, 100)).toBe(1);
    expect(interfaceScale({ zoom: 150, followTextSize: true }, 100)).toBe(1.5);
  });

  it("multiplies the zoom by the Windows text size", () => {
    expect(interfaceScale({ zoom: 100, followTextSize: true }, 125)).toBe(1.25);
    expect(interfaceScale({ zoom: 150, followTextSize: true }, 125)).toBe(1.875);
    expect(interfaceScale({ zoom: 110, followTextSize: true }, 150)).toBe(1.65);
    expect(interfaceScale({ zoom: 200, followTextSize: true }, 225)).toBe(4.5);
  });

  it("leaves the Windows text size out when the setting is off", () => {
    expect(interfaceScale({ zoom: 100, followTextSize: false }, 225)).toBe(1);
    expect(interfaceScale({ zoom: 125, followTextSize: false }, 150)).toBe(1.25);
  });
});
