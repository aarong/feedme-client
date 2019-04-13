import messageParser from "../messageparser";

// It's taken as given that the spec's JSON Schemas are correct

describe("The messageParser.parse() function", () => {
  it("should throw on invalid JSON", () => {
    expect(() => {
      messageParser.parse("garbage");
    }).toThrow(new Error("INVALID_MESSAGE: Invalid JSON."));
  });

  it("should throw on non-object JSON", () => {
    expect(() => {
      messageParser.parse('"a string"');
    }).toThrow(new Error("INVALID_MESSAGE: Not an object."));
  });

  it("should throw on missing MessageType", () => {
    expect(() => {
      messageParser.parse("{}");
    }).toThrow(new Error("INVALID_MESSAGE: Invalid message type."));
  });

  it("should throw on invalid MessageType", () => {
    expect(() => {
      messageParser.parse('{"MessageType":"garbage"}');
    }).toThrow(new Error("INVALID_MESSAGE: Invalid message type."));
  });

  it("should throw on message schema violation", () => {
    expect(() => {
      messageParser.parse('{"MessageType":"HandshakeResponse"}');
    }).toThrow(new Error("INVALID_MESSAGE: Message schema validation failed."));
  });

  it("should throw on invalid delta operation", () => {
    expect(() => {
      messageParser.parse(
        JSON.stringify({
          MessageType: "ActionRevelation",
          ActionName: "SomeAction",
          ActionData: {},
          FeedName: "SomeFeed",
          FeedArgs: {},
          FeedDeltas: [{ Operation: "Garbage" }]
        })
      );
    }).toThrow(new Error("INVALID_MESSAGE: Invalid delta operation."));
  });

  it("should throw on delta schema violation", () => {
    expect(() => {
      messageParser.parse(
        JSON.stringify({
          MessageType: "ActionRevelation",
          ActionName: "SomeAction",
          ActionData: {},
          FeedName: "SomeFeed",
          FeedArgs: {},
          FeedDeltas: [{ Operation: "Set" }]
        })
      );
    }).toThrow(new Error("INVALID_MESSAGE: Delta schema validation failed."));
  });

  it("should return message object if valid", () => {
    expect(
      messageParser.parse(
        '{"MessageType":"HandshakeResponse", "Success": true, "Version": "0.1", "ClientId": "ABC"}'
      )
    ).toEqual(
      JSON.parse(
        '{"MessageType":"HandshakeResponse", "Success": true, "Version": "0.1", "ClientId": "ABC"}'
      )
    );
  });
});
