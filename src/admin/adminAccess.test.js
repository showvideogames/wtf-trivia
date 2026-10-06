import { describe, it, expect } from "vitest";
import {
  ADMIN_STATUSES,
  StorageUploadError,
  canWriteAs,
  classifyStorageFailure,
  copyFailureCode,
  describeAdminAccess,
  isAccessProblem,
  uploadFailureMessage,
} from "./adminAccess.js";

// Since 0003_wtf_admin_gate.sql only a signed-in admin account may upload to
// wtf-images. A guest's upload is refused by row-level security; that must
// read as a sign-in problem, never as "check your connection".

describe("classifyStorageFailure", () => {
  it("row-level security refusal in Storage's HTTP 400 envelope is a permission problem", () => {
    const e = classifyStorageFailure(400, JSON.stringify({ statusCode: "403", error: "Unauthorized", message: "new row violates row-level security policy" }));
    expect(e).toBeInstanceOf(StorageUploadError);
    expect(e.code).toBe("permission");
    expect(e.status).toBe(403);
    expect(e.detail).toMatch(/row-level security/);
  });
  it("a plain 403 is a permission problem", () => {
    expect(classifyStorageFailure(403, "").code).toBe("permission");
  });
  it("an expired or invalid token, or a 401, means the session is gone", () => {
    expect(classifyStorageFailure(400, JSON.stringify({ statusCode: "400", error: "InvalidJWT", message: "\"exp\" claim timestamp check failed" })).code).toBe("signed-out");
    expect(classifyStorageFailure(400, JSON.stringify({ statusCode: "403", error: "Unauthorized", message: "invalid compact jws" })).code).toBe("signed-out");
    expect(classifyStorageFailure(401, "Unauthorized").code).toBe("signed-out");
  });
  it("anything else from Storage is a server error with its status", () => {
    const e = classifyStorageFailure(500, "<html>Bad gateway</html>");
    expect(e.code).toBe("server");
    expect(e.status).toBe(500);
    expect(classifyStorageFailure(413, JSON.stringify({ statusCode: "413", error: "Payload too large", message: "The object exceeded the maximum allowed size" })).code).toBe("server");
  });
});

describe("uploadFailureMessage", () => {
  const signedOut = new StorageUploadError("signed-out");
  const refused = new StorageUploadError("permission", { status: 403 });
  const offline = new StorageUploadError("network");
  const broken = new StorageUploadError("server", { status: 502 });

  it("a sign-in or permission failure says so, and never blames the connection", () => {
    for (const e of [signedOut, refused]) {
      const m = uploadFailureMessage(e, true);
      expect(m).toMatch(/admin account/);
      expect(m).not.toMatch(/connection/i);
      expect(m).toMatch(/current image is unchanged/);
    }
  });
  it("only a request that got no answer is a connection problem", () => {
    expect(uploadFailureMessage(offline, true)).toMatch(/Check your connection/);
    expect(uploadFailureMessage(new Error("Failed to fetch"), true)).toMatch(/Check your connection/);
    expect(uploadFailureMessage(broken, true)).toMatch(/returned an error \(502\)/);
    expect(uploadFailureMessage(broken, true)).not.toMatch(/connection/i);
  });
  it("says nothing was saved when the field was empty", () => {
    expect(uploadFailureMessage(refused, false)).toMatch(/nothing was saved/);
  });
});

describe("publish copy codes", () => {
  it("maps storage failures onto the publish warning codes", () => {
    expect(copyFailureCode(new StorageUploadError("signed-out"))).toBe("upload-auth");
    expect(copyFailureCode(new StorageUploadError("permission"))).toBe("upload-auth");
    expect(copyFailureCode(new StorageUploadError("network"))).toBe("upload-network");
    expect(copyFailureCode(new StorageUploadError("server", { status: 500 }))).toBe("upload");
    expect(copyFailureCode(new Error("?"))).toBe("upload");
    expect(isAccessProblem("permission")).toBe(true);
    expect(isAccessProblem("network")).toBe(false);
  });
});

describe("describeAdminAccess", () => {
  it("only an admin account can write", () => {
    expect(ADMIN_STATUSES.filter(canWriteAs)).toEqual(["admin"]);
    for (const s of ADMIN_STATUSES) expect(describeAdminAccess(s).canWrite).toBe(s === "admin");
  });
  it("offers the one action that fixes each state", () => {
    expect(describeAdminAccess("guest").action).toBe("signin");
    expect(describeAdminAccess("guest").body).toMatch(/signed in as a guest/);
    expect(describeAdminAccess("not_admin", "someone@example.com").action).toBe("signout");
    expect(describeAdminAccess("not_admin", "someone@example.com").body).toMatch(/someone@example\.com/);
    expect(describeAdminAccess("unavailable").action).toBe("retry");
    expect(describeAdminAccess("checking").action).toBe(null);
  });
});
