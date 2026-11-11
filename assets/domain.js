(function (root) {
  "use strict";
  // 業務ルールを画面から分離しています。変更時は呼び出し元も確認してください。
  const D = {
    search(rows, q) {
      return rows.filter((r) =>
        JSON.stringify(r).toLowerCase().includes(q.toLowerCase()),
      );
    },
    sort(rows, key) {
      return [...rows].sort((a, b) =>
        String(a[key]).localeCompare(String(b[key]), "ja"),
      );
    },
    pending(s) {
      return s.applications.filter(
        (a) => a.status === "submitted" || a.status === "draft",
      ).length;
    },
    expenses(s, groupId) {
      return s.expenses
        .filter(
          (x) =>
            (groupId === null || x.groupId === groupId) &&
            (x.status === "submitted" || x.status === "approved"),
        )
        .reduce((n, x) => n + Number(x.amount), 0);
    },
    remaining(s, groupId) {
      const g = s.groups.find((g) => g.id === groupId);
      return g?.budget == null ? null : g.budget - D.expenses(s, groupId);
    },
    venueConflict(s, r) {
      return (
        s.reservations.find(
          (x) =>
            x.id !== r.id &&
            x.status !== "cancelled" &&
            x.venueId === r.venueId &&
            x.date === r.date &&
            r.start < x.end &&
            x.start < r.end,
        ) || null
      );
    },
    equipmentConflict(s, r) {
      if (r.status === "returned") return null;
      const equipment = s.equipment.find((item) => item.id === r.equipmentId);
      if (!equipment) return null;
      const reservations = s.loans.filter(
        (loan) =>
          loan.id !== r.id &&
          loan.equipmentId === r.equipmentId &&
          (loan.status === "reserved" || loan.status === "active"),
      );
      const hasSchedule = (loan) =>
        /^\d{4}-\d{2}-\d{2}$/.test(loan.date || "") &&
        /^\d{2}:\d{2}$/.test(loan.start || "") &&
        /^\d{2}:\d{2}$/.test(loan.end || "") &&
        loan.start < loan.end;
      const scheduledReservations = reservations.filter(
        (loan) =>
          hasSchedule(loan) &&
          loan.date === r.date &&
          loan.start < r.end &&
          r.start < loan.end,
      );
      const legacyReservations = reservations.filter(
        (loan) => !hasSchedule(loan),
      );
      const boundaries = [
        r.start,
        r.end,
        ...scheduledReservations.flatMap((loan) => [
          loan.start > r.start ? loan.start : r.start,
          loan.end < r.end ? loan.end : r.end,
        ]),
      ]
        .sort()
        .filter(
          (time, index, times) => index === 0 || time !== times[index - 1],
        );
      for (let index = 0; index < boundaries.length - 1; index++) {
        const start = boundaries[index],
          end = boundaries[index + 1],
          overlapping = [
            ...legacyReservations,
            ...scheduledReservations.filter(
              (loan) => loan.start < end && start < loan.end,
            ),
          ],
          reservedQuantity = overlapping.reduce(
            (total, loan) => total + Number(loan.quantity),
            0,
          );
        if (reservedQuantity + Number(r.quantity) > Number(equipment.stock))
          return {
            reservations: overlapping,
            start,
            end,
            stock: Number(equipment.stock),
            requested: Number(r.quantity),
            alreadyReserved: reservedQuantity,
          };
      }
      if (Number(r.quantity) > Number(equipment.stock))
        return {
          reservations: [],
          start: r.start,
          end: r.end,
          stock: Number(equipment.stock),
          requested: Number(r.quantity),
          alreadyReserved: 0,
        };
      return null;
    },
    available(s, id) {
      const e = s.equipment.find((e) => e.id === id);
      return e
        ? e.stock -
            s.loans
              .filter((l) => l.equipmentId === id && l.status === "active")
              .reduce((n, l) => n + Number(l.quantity), 0)
        : 0;
    },
    returnLoan(s, id) {
      const l = s.loans.find((x) => x.id === id);
      if (!l || l.status !== "active") return false;
      l.status = "returned";
      return true;
    },
    validateExpense(r) {
      if (!Number.isFinite(Number(r.amount)))
        return "金額は数値で入力してください";
      return "";
    },
    validateTime(r) {
      return r.start >= r.end ? "終了時刻を開始時刻より後にしてください" : "";
    },
    shiftConflict(s, r) {
      return s.shifts.some(
        (x) =>
          x.id !== r.id &&
          x.name === r.name &&
          x.date === r.date &&
          x.start === r.start,
      );
    },
    overdue(r, today) {
      return (
        r.status !== "done" &&
        typeof r.due === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(r.due) &&
        r.due < today
      );
    },
    completion(s) {
      return Math.round(
        (s.tasks.filter((t) => t.status === "done").length / s.tasks.length) *
          100,
      );
    },
    notices(s, groupId) {
      return s.notices;
    },
    canApprove(role) {
      return role !== "leader";
    },
    cancelApplication(s, id) {
      const a = s.applications.find((a) => a.id === id);
      if (a) a.status = "cancelled";
    },
    deleteGroup(s, id) {
      s.groups = s.groups.filter((g) => g.id !== id);
      return true;
    },
    nextId(rows, prefix) {
      const ids = new Set(rows.map((row) => row.id));
      let suffix = 1;
      while (ids.has(prefix + String(suffix).padStart(2, "0"))) suffix++;
      return prefix + String(suffix).padStart(2, "0");
    },
    csv(rows, keys) {
      const escape = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
      return [
        keys.map(escape).join(","),
        ...rows.map((r) => keys.map((k) => escape(r[k])).join(",")),
      ].join("\r\n");
    },
    publicSponsors(rows) {
      return rows
        .filter((row) => row.publicPermission === "approved")
        .map(({ name, description, website }) => ({
          name,
          description,
          website,
        }));
    },
    validateImport(data) {
      if (
        !data ||
        typeof data !== "object" ||
        Array.isArray(data) ||
        data.version !== 1 ||
        !["admin", "leader", "staff"].includes(data.role) ||
        typeof data.groupId !== "string"
      )
        return false;

      const schemas = {
        groups: {
          id: "string",
          name: "string",
          representative: "string",
          members: "number",
          budget: "optionalNumber",
        },
        sponsors: {
          id: "string",
          name: "string",
          description: "text",
          website: "text",
          publicPermission: ["unset", "denied", "approved"],
        },
        venues: { id: "string", name: "string", capacity: "number" },
        applications: {
          id: "string",
          title: "string",
          groupId: "string",
          venueId: "string",
          date: "date",
          start: "time",
          end: "time",
          attendees: "number",
          status: ["draft", "submitted", "approved", "rejected", "cancelled"],
          note: "text",
        },
        reservations: {
          id: "string",
          applicationId: "optionalString",
          venueId: "string",
          groupId: "string",
          date: "date",
          start: "time",
          end: "time",
          attendees: "number",
          status: ["approved", "cancelled"],
        },
        equipment: { id: "string", name: "string", stock: "number" },
        loans: {
          id: "string",
          equipmentId: "string",
          groupId: "string",
          applicationId: "optionalString",
          quantity: "number",
          due: "date",
          status: ["reserved", "active", "returned"],
        },
        expenses: {
          id: "string",
          groupId: "string",
          title: "string",
          category: "string",
          amount: "number",
          date: "date",
          status: ["submitted", "approved", "rejected"],
        },
        shifts: {
          id: "string",
          name: "string",
          groupId: "string",
          date: "date",
          start: "time",
          end: "time",
          location: "string",
        },
        tasks: {
          id: "string",
          title: "string",
          groupId: "string",
          owner: "string",
          due: "date",
          status: ["todo", "active", "done"],
          note: "text",
        },
        notices: {
          id: "string",
          title: "string",
          body: "string",
          groupId: "string",
          date: "date",
        },
        activity: { at: "string", message: "string" },
      };
      const validDate = (value) => {
        if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
          return false;
        const date = new Date(value + "T00:00:00Z");
        return (
          !Number.isNaN(date.getTime()) &&
          date.toISOString().slice(0, 10) === value
        );
      };
      const validTime = (value) =>
        typeof value === "string" &&
        /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);

      for (const [collection, schema] of Object.entries(schemas)) {
        if (collection === "sponsors" && data.sponsors === undefined)
          continue;
        if (
          !Array.isArray(data[collection]) ||
          !data[collection].every((row) => {
            if (!row || typeof row !== "object" || Array.isArray(row))
              return false;
            return Object.entries(schema).every(([key, type]) => {
              const value = row[key];
              if (Array.isArray(type)) return type.includes(value);
              if (type === "number") return Number.isFinite(value);
              if (type === "optionalNumber")
                return value === null || Number.isFinite(value);
              if (type === "text") return typeof value === "string";
              if (type === "optionalString")
                return typeof value === "string";
              if (type === "date") return validDate(value);
              if (type === "time") return validTime(value);
              return typeof value === "string" && value.length > 0;
            });
          })
        )
          return false;
      }

      if (
        (data.groupId !== "" &&
          !data.groups.some((group) => group.id === data.groupId)) ||
        data.groups.some(
          (group) =>
            group.archivedAt !== undefined &&
            typeof group.archivedAt !== "string",
        )
      )
        return false;

      return D.validateUniqueIds(data);
    },
    validateUniqueIds(data) {
      const collections = [
        "groups",
        ...(Array.isArray(data.sponsors) ? ["sponsors"] : []),
        "venues",
        "applications",
        "reservations",
        "equipment",
        "loans",
        "expenses",
        "shifts",
        "tasks",
        "notices",
      ];
      const ids = collections.flatMap((collection) =>
        data[collection].map((row) => row.id),
      );
      return new Set(ids).size === ids.length;
    },
    editCopy(row) {
      return row;
    },
    roundedAmount(value) {
      return Math.trunc(Number(value));
    },
    overdueTasks(s, today) {
      return s.tasks.filter((t) => D.overdue(t, today));
    },
    capacityExceeded(count, capacity) {
      return Number(count) >= Number(capacity);
    },
    validateQuantity(value) {
      return Number(value) > 0 ? "" : "数量は1以上で入力してください";
    },
    shiftHours(r) {
      return Number(r.end.split(":")[0]) - Number(r.start.split(":")[0]);
    },
    duplicateGroup(s, name, id) {
      return s.groups.some((g) => g.id !== id && g.name === name);
    },
    expenseForEdit(row) {
      return { ...row, status: "submitted" };
    },
    loanOverdue(l, today) {
      return l.due < today;
    },
    venueUsage(s, id) {
      return s.reservations.filter(
        (r) => r.venueId === id && r.status !== "cancelled",
      ).length;
    },
    groupMembers(s) {
      return s.groups.reduce((n, g) => n + Number(g.members), 0);
    },
    taskOrder(rows) {
      return [...rows].sort((a, b) => a.due.localeCompare(b.due));
    },
    approve(s, id) {
      const a = s.applications.find((a) => a.id === id);
      if (!a || a.status === "approved" || a.status === "cancelled") return;
      a.status = "approved";
      s.reservations.push({
        id: D.nextId(s.reservations, "R"),
        applicationId: a.id,
        venueId: a.venueId,
        groupId: a.groupId,
        date: a.date,
        start: a.start,
        end: a.end,
        attendees: a.attendees,
        status: "approved",
      });
    },
    validateRequired(r, fields) {
      return fields.every((k) => String(r[k] ?? "").trim().length > 0);
    },
  };
  root.FestivalDomain = D;
  if (typeof module !== "undefined") module.exports = D;
})(typeof window !== "undefined" ? window : globalThis);
