import { UserBillingHistory } from "src/server/accounting/billingLogic"
import {
  createBillingFilter,
  createDuplicateCourseFilter,
  createDuplicateNameFilter,
  incompleteUsernameOrPflegekasse,
  pflegeABCFilter,
  pkvTagsFilter,
  testTagsFilter,
} from "src/server/accounting/filters"
import { BillableEventData, FilterResult } from "src/server/accounting/types"
import * as learnworlds from "src/server/user/learnworlds"

jest.mock("src/server/user/learnworlds")

describe("filters", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe("pflegeABCFilter", () => {
    it.each([
      {
        description: "should exclude @pflegeabc.de email",
        email: "user@pflegeabc.de",
        expectedAction: "exclude",
        expectedReason: "Interner PflegeABC Benutzer",
      },
      {
        description: "should exclude @pflegegrad-beantragen.de email",
        email: "user@pflegegrad-beantragen.de",
        expectedAction: "exclude",
        expectedReason: "Interner PflegeABC Benutzer",
      },
      {
        description: "should exclude learnworlds.com email",
        email: "user@learnworlds.com",
        expectedAction: "exclude",
        expectedReason: "Interner PflegeABC Benutzer",
      },
      {
        description: "should keep regular email",
        email: "user@example.com",
        expectedAction: "keep",
      },
    ])("$description", async ({ email, expectedAction, expectedReason }) => {
      const courseStart = createCourseStart({ email })

      const result = await pflegeABCFilter(courseStart)

      if (expectedAction === "exclude") {
        expectExcludeAction(result, expectedReason!)
      } else {
        expectKeepAction(result)
      }
    })
  })

  describe("testTagsFilter", () => {
    it.each([
      {
        description: "should exclude tags with testzugang (lowercase)",
        tags: ["testzugang", "other-tag"],
        expectedAction: "exclude",
        expectedReason: "Enthält Test-Tag(s)",
      },
      {
        description: "should exclude tags with testzugang (uppercase)",
        tags: ["TESTZUGANG"],
        expectedAction: "exclude",
        expectedReason: "Enthält Test-Tag(s)",
      },
      {
        description: "should exclude tags with testzugang (mixed case)",
        tags: ["Testzugang"],
        expectedAction: "exclude",
        expectedReason: "Enthält Test-Tag(s)",
      },
      {
        description: "should keep tags with other values",
        tags: ["pkv", "regular-tag"],
        expectedAction: "keep",
      },
    ])("$description", async ({ tags, expectedAction, expectedReason }) => {
      const courseStart = createCourseStart({ tags })

      const result = await testTagsFilter(courseStart)

      if (expectedAction === "exclude") {
        expectExcludeAction(result, expectedReason!)
      } else {
        expectKeepAction(result)
      }
    })
  })

  describe("pkvTagsFilter", () => {
    it.each([
      {
        description: "should exclude tags with pkv",
        tags: ["PKV"],
        expectedAction: "exclude",
        expectedReason: "Privatversichert",
      },
      {
        description: "should exclude tags with pkv_paid",
        tags: ["PKV_PAID"],
        expectedAction: "exclude",
        expectedReason: "Privatversichert",
      },
      {
        description: "should exclude tags with pkv falschangabe",
        tags: ["PKV Falschangabe"],
        expectedAction: "exclude",
        expectedReason: "Privatversichert",
      },
      {
        description: "should keep tags with other values",
        tags: ["regular-tag", "testzugang"],
        expectedAction: "keep",
      },
    ])("$description", async ({ tags, expectedAction, expectedReason }) => {
      const courseStart = createCourseStart({ tags })

      const result = await pkvTagsFilter(courseStart)

      if (expectedAction === "exclude") {
        expectExcludeAction(result, expectedReason!)
      } else {
        expectKeepAction(result)
      }
    })
  })

  describe("incompleteUsernameOrPflegekasse", () => {
    beforeEach(() => {
      jest.spyOn(learnworlds, "getUserDetailsFromCertificate")
    })

    describe("Complete Data Scenarios", () => {
      it("should keep action when name and pflegekasse are complete", async () => {
        const courseStart = createCourseStart({
          name: "John Doe",
          pflegekasse: "AOK Bayern",
        })

        const result = await incompleteUsernameOrPflegekasse(courseStart)

        expectKeepAction(result)
        expect(learnworlds.getUserDetailsFromCertificate).not.toHaveBeenCalled()
      })
    })

    describe("Incomplete Name Scenarios", () => {
      it.each([
        {
          description:
            "should transform single word name when certificate returns firstName and lastName",
          name: "John",
          mockReturn: {
            firstName: "John",
            lastName: "Complete",
            pflegekasse: null,
          },
          expectedReason:
            "Name unvollständig - aus Learnworlds-Zertifikat ergänzt",
        },
        {
          description:
            "should transform null name when certificate returns firstName and lastName",
          name: null,
          mockReturn: {
            firstName: "Jane",
            lastName: "Smith",
            pflegekasse: null,
          },
          expectedReason:
            "Name unvollständig - aus Learnworlds-Zertifikat ergänzt",
        },
        {
          description:
            "should transform empty string name when certificate returns firstName and lastName",
          name: "",
          mockReturn: {
            firstName: "Bob",
            lastName: "Wilson",
            pflegekasse: null,
          },
          expectedReason:
            "Name unvollständig - aus Learnworlds-Zertifikat ergänzt",
        },
        {
          description: "should transform name when certificate returns no data",
          name: "Single",
          mockReturn: { firstName: null, lastName: null, pflegekasse: null },
          expectedReason:
            "Name unvollständig - konnte nicht aus Zertifikat ergänzt werden",
        },
      ])("$description", async ({ name, mockReturn, expectedReason }) => {
        const userId = "test-user-incomplete"
        const courseStart = createCourseStart({ userId, name })

        jest
          .spyOn(learnworlds, "getUserDetailsFromCertificate")
          .mockResolvedValue(mockReturn)

        const result = await incompleteUsernameOrPflegekasse(courseStart)

        expectTransformAction(result, expectedReason, {
          userId,
        })

        if (mockReturn.firstName && mockReturn.lastName) {
          expect(result.data?.name).toBe(
            `${mockReturn.firstName} ${mockReturn.lastName}`,
          )
        }

        expect(learnworlds.getUserDetailsFromCertificate).toHaveBeenCalledWith(
          userId,
        )
      })
    })

    describe("Missing Pflegekasse Scenarios", () => {
      it.each([
        {
          description:
            "should transform when pflegekasse is null and certificate returns pflegekasse",
          pflegekasse: null,
          mockReturn: {
            firstName: null,
            lastName: null,
            pflegekasse: "AOK Bayern",
          },
          expectedReason:
            "Pflegekasse fehlend - aus Learnworlds-Zertifikat ergänzt",
        },
        {
          description:
            "should transform when pflegekasse is empty string and certificate returns pflegekasse",
          pflegekasse: "",
          mockReturn: {
            firstName: null,
            lastName: null,
            pflegekasse: "Techniker Krankenkasse",
          },
          expectedReason:
            "Pflegekasse fehlend - aus Learnworlds-Zertifikat ergänzt",
        },
        {
          description:
            "should transform when certificate returns no pflegekasse",
          pflegekasse: null,
          mockReturn: { firstName: null, lastName: null, pflegekasse: null },
          expectedReason:
            "Pflegekasse fehlend - konnte nicht aus Zertifikat ergänzt werden",
        },
      ])(
        "$description",
        async ({ pflegekasse, mockReturn, expectedReason }) => {
          const userId = "test-user-missing-pk"
          const courseStart = createCourseStart({
            userId,
            pflegekasse,
          })

          jest
            .spyOn(learnworlds, "getUserDetailsFromCertificate")
            .mockResolvedValue(mockReturn)

          const result = await incompleteUsernameOrPflegekasse(courseStart)

          expectTransformAction(result, expectedReason, { userId })

          if (mockReturn.pflegekasse) {
            expect(result.data?.pflegekasse).toBe(mockReturn.pflegekasse)
          }

          expect(
            learnworlds.getUserDetailsFromCertificate,
          ).toHaveBeenCalledWith(userId)
        },
      )
    })

    describe("Both Incomplete Scenarios", () => {
      it.each([
        {
          description:
            "should transform both when certificate fills both name and pflegekasse",
          name: "Incomplete",
          pflegekasse: null,
          mockReturn: {
            firstName: "John",
            lastName: "Complete",
            pflegekasse: "AOK Bayern",
          },
          expectedReason:
            "Name und Pflegekasse unvollständig - aus Learnworlds-Zertifikat ergänzt",
        },
        {
          description: "should transform both when certificate fills only name",
          name: "Incomplete",
          pflegekasse: null,
          mockReturn: {
            firstName: "Jane",
            lastName: "Smith",
            pflegekasse: null,
          },
          expectedReason:
            "Name und Pflegekasse unvollständig - Name aus Learnworlds-Zertifikat ergänzt",
        },
        {
          description:
            "should transform both when certificate fills only pflegekasse",
          name: "Incomplete",
          pflegekasse: null,
          mockReturn: {
            firstName: null,
            lastName: null,
            pflegekasse: "Barmer",
          },
          expectedReason:
            "Name und Pflegekasse unvollständig - Pflegekasse aus Learnworlds-Zertifikat ergänzt",
        },
        {
          description: "should transform both when certificate fills neither",
          name: "Incomplete",
          pflegekasse: null,
          mockReturn: {
            firstName: null,
            lastName: null,
            pflegekasse: null,
          },
          expectedReason:
            "Name und Pflegekasse unvollständig - konnte nicht aus Zertifikat ergänzt werden",
        },
      ])(
        "$description",
        async ({ name, pflegekasse, mockReturn, expectedReason }) => {
          const userId = "test-user-both-incomplete"
          const courseStart = createCourseStart({ userId, name, pflegekasse })

          jest
            .spyOn(learnworlds, "getUserDetailsFromCertificate")
            .mockResolvedValue(mockReturn)

          const result = await incompleteUsernameOrPflegekasse(courseStart)

          expectTransformAction(result, expectedReason, { userId })

          if (mockReturn.firstName && mockReturn.lastName) {
            expect(result.data?.name).toBe(
              `${mockReturn.firstName} ${mockReturn.lastName}`,
            )
          }

          if (mockReturn.pflegekasse) {
            expect(result.data?.pflegekasse).toBe(mockReturn.pflegekasse)
          }

          expect(
            learnworlds.getUserDetailsFromCertificate,
          ).toHaveBeenCalledWith(userId)
        },
      )
    })
  })

  describe("createBillingFilter", () => {
    it.each([
      {
        description:
          "should exclude course already billed for user within 2 years",
        userId: "user-1",
        courseId: "demenz",
        billingData: [
          {
            userId: "user-1",
            courseId: "demenz",
            startedAt: new Date("2024-01-15"),
            billingDate: new Date("2024-02-01"),
          },
        ],
        expectedAction: "exclude",
        expectedReason: "Kurs innerhalb der letzten 2 Jahre abgerechnet",
      },
      {
        description: "should keep course not billed for user",
        userId: "user-1",
        courseId: "grundlagen",
        billingData: [
          {
            userId: "user-1",
            courseId: "demenz",
            startedAt: new Date("2024-01-15"),
            billingDate: new Date("2024-02-01"),
          },
        ],
        expectedAction: "keep",
      },
      {
        description: "should keep when user not in billing history",
        userId: "user-2",
        courseId: "demenz",
        billingData: [
          {
            userId: "user-1",
            courseId: "demenz",
            startedAt: new Date("2024-01-15"),
            billingDate: new Date("2024-02-01"),
          },
        ],
        expectedAction: "keep",
      },
      {
        description: "should keep different course for same user",
        userId: "user-1",
        courseId: "sterbebegleitung",
        billingData: [
          {
            userId: "user-1",
            courseId: "demenz",
            startedAt: new Date("2024-01-15"),
            billingDate: new Date("2024-02-01"),
          },
        ],
        expectedAction: "keep",
      },
      {
        description: "should keep course billed more than 2 years ago",
        userId: "user-1",
        courseId: "demenz",
        billingData: [
          {
            userId: "user-1",
            courseId: "demenz",
            startedAt: new Date("2022-01-15"),
            billingDate: new Date("2022-02-01"),
          },
        ],
        expectedAction: "keep",
      },
    ])(
      "$description",
      async ({
        userId,
        courseId,
        billingData,
        expectedAction,
        expectedReason,
      }) => {
        const courseStart = createCourseStart({ userId, courseId })
        const billingHistory = createBillingHistory(billingData)
        const filter = createBillingFilter(billingHistory)

        const result = await filter(courseStart)

        if (expectedAction === "exclude") {
          expectExcludeAction(result, expectedReason!)
        } else {
          expectKeepAction(result)
        }
      },
    )
  })

  describe("createDuplicateNameFilter", () => {
    it("should mark all duplicate names within the same course", async () => {
      const cs1 = createCourseStart({
        courseId: "demenz",
        name: "Max Mustermann",
      })
      const cs2 = createCourseStart({
        courseId: "demenz",
        name: "Max Mustermann",
      })
      const cs3 = createCourseStart({
        courseId: "demenz",
        name: "Max Mustermann",
      })
      const cs4 = createCourseStart({ courseId: "demenz", name: "Anna Anders" })

      const courseStarts = [cs1, cs2, cs3, cs4]
      const filter = createDuplicateNameFilter(courseStarts)

      const r1 = await filter(cs1)
      const r2 = await filter(cs2)
      const r3 = await filter(cs3)
      const r4 = await filter(cs4)

      expectTransformAction(r1, "Namensduplikat im Kurs")
      expectTransformAction(r2, "Namensduplikat im Kurs")
      expectTransformAction(r3, "Namensduplikat im Kursx")
      expectKeepAction(r4)
    })

    it("should not mark duplicates across different courses", async () => {
      const cs1 = createCourseStart({
        courseId: "demenz",
        name: "Max Mustermann",
      })
      const cs2 = createCourseStart({
        courseId: "grundlagen",
        name: "Max Mustermann",
      })
      const filter = createDuplicateNameFilter([cs1, cs2])

      expectKeepAction(await filter(cs1))
      expectKeepAction(await filter(cs2))
    })

    it("should trim whitespace when detecting duplicates", async () => {
      const cs1 = createCourseStart({
        courseId: "demenz",
        name: "Max Mustermann",
      })
      const cs2 = createCourseStart({
        courseId: "demenz",
        name: " Max Mustermann ",
      })
      const filter = createDuplicateNameFilter([cs1, cs2])

      expectTransformAction(await filter(cs1), "Namensduplikat im Kurs")
      expectTransformAction(await filter(cs2), "Namensduplikat im Kurs")
    })

    it("should handle null names gracefully", async () => {
      const cs1 = createCourseStart({ courseId: "demenz", name: null })
      const cs2 = createCourseStart({ courseId: "demenz", name: null })
      const filter = createDuplicateNameFilter([cs1, cs2])

      expectKeepAction(await filter(cs1))
      expectKeepAction(await filter(cs2))
    })

    it("should be case-insensitive for name matching", async () => {
      const cs1 = createCourseStart({
        courseId: "demenz",
        name: "Max Mustermann",
      })
      const cs2 = createCourseStart({
        courseId: "demenz",
        name: "max mustermann",
      })
      const filter = createDuplicateNameFilter([cs1, cs2])

      expectTransformAction(await filter(cs1), "Namensduplikat im Kurs")
      expectTransformAction(await filter(cs2), "Namensduplikat im Kurs")
    })
  })

  describe("createDuplicateCourseFilter", () => {
    it("should mark second occurrence when user starts both courses from a duplicate pair", async () => {
      const cs1 = createCourseStart({
        userId: "user-1",
        courseId: "demenz",
      })
      const cs2 = createCourseStart({
        userId: "user-1",
        courseId: "dementia",
      })
      const filter = createDuplicateCourseFilter([cs1, cs2])

      expectKeepAction(await filter(cs1))
      expectTransformAction(
        await filter(cs2),
        "Im gleichen Monat wurde schon Kurs demenz gestartet",
      )
    })

    it("should handle multiple duplicate pairs independently", async () => {
      const cs1 = createCourseStart({
        userId: "user-1",
        courseId: "demenz",
      })
      const cs2 = createCourseStart({
        userId: "user-1",
        courseId: "dementia",
      })
      const cs3 = createCourseStart({
        userId: "user-1",
        courseId: "grundlagen",
      })
      const cs4 = createCourseStart({
        userId: "user-1",
        courseId: "basic-knowledge-for-informal-caregivers",
      })
      const filter = createDuplicateCourseFilter([cs1, cs2, cs3, cs4])

      expectKeepAction(await filter(cs1))
      expectTransformAction(
        await filter(cs2),
        "Im gleichen Monat wurde schon Kurs demenz gestartet",
      )
      expectKeepAction(await filter(cs3))
      expectTransformAction(
        await filter(cs4),
        "Im gleichen Monat wurde schon Kurs grundlagen gestartet",
      )
    })

    it("should not mark duplicates across different users", async () => {
      const cs1 = createCourseStart({
        userId: "user-1",
        courseId: "demenz",
      })
      const cs2 = createCourseStart({
        userId: "user-2",
        courseId: "dementia",
      })
      const filter = createDuplicateCourseFilter([cs1, cs2])

      expectKeepAction(await filter(cs1))
      expectKeepAction(await filter(cs2))
    })

    it("should keep course when user only starts one course from a duplicate pair", async () => {
      const cs1 = createCourseStart({
        userId: "user-1",
        courseId: "demenz",
      })
      const filter = createDuplicateCourseFilter([cs1])

      expectKeepAction(await filter(cs1))
    })

    it("should keep courses that are not part of any duplicate pair", async () => {
      const cs1 = createCourseStart({
        userId: "user-1",
        courseId: "trauer",
      })
      const cs2 = createCourseStart({
        userId: "user-1",
        courseId: "sterbebegleitung",
      })
      const filter = createDuplicateCourseFilter([cs1, cs2])

      expectKeepAction(await filter(cs1))
      expectKeepAction(await filter(cs2))
    })
  })

  function createCourseStart(
    overrides: Partial<BillableEventData> = {},
  ): BillableEventData {
    return {
      userId: "test-user-1",
      name: "John Doe",
      pflegekasse: "AOK Bayern",
      createdAt: new Date("2024-01-01"),
      lastBillableActivity: new Date("2024-01-15"),
      courseId: "demenz",
      email: "john.doe@example.com",
      tags: [],
      ...overrides,
    }
  }

  function createBillingHistory(
    data: Array<{
      userId: string
      courseId: string
      startedAt: Date
      billingDate?: Date
    }>,
  ): UserBillingHistory {
    const history = new Map<
      string,
      Array<{ courseId: string; startedAt: Date; billingDate: Date }>
    >()

    for (const entry of data) {
      const existing = history.get(entry.userId) || []
      existing.push({
        courseId: entry.courseId,
        startedAt: entry.startedAt,
        billingDate: entry.billingDate ?? new Date("2024-02-01"),
      })
      history.set(entry.userId, existing)
    }

    return history
  }

  function expectKeepAction(result: FilterResult) {
    expect(result.action).toBe("keep")
    expect(result.reason).toBeUndefined()
  }

  function expectExcludeAction(result: FilterResult, expectedReason: string) {
    expect(result.action).toBe("exclude")
    expect(result.reason).toBe(expectedReason)
  }

  function expectTransformAction(
    result: FilterResult,
    expectedReason: string,
    expectedData?: Partial<BillableEventData>,
  ) {
    expect(result.action).toBe("transform")
    expect(result.reason).toBe(expectedReason)
    if (expectedData) {
      expect(result.data).toEqual(expect.objectContaining(expectedData))
    }
  }
})
