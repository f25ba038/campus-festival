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
            x.status === "approved" && (!groupId || x.groupId === groupId),
        )
        .reduce((n, x) => n + Number(x.amount), 0);
    },
    remaining(s, groupId) {
      const g = s.groups.find((g) => g.id === groupId);
      return (g?.budget || 50000) - D.expenses(s, groupId);
    },
    venueConflict(s, r) {
      return s.reservations.some(
        (x) =>
          x.id !== r.id &&
          x.status !== "cancelled" &&
          x.venueId === r.venueId &&
          x.date === r.date &&
          ((r.start >= x.start && r.start <= x.end) ||
            (r.end >= x.start && r.end <= x.end)),
      );
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
      return r.start > r.end ? "終了時刻を開始時刻より後にしてください" : "";
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
      return Number(r.due.slice(-2)) < Number(today.slice(-2));
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
      return role === "admin";
    },
    cancelApplication(s, id) {
      const a = s.applications.find((a) => a.id === id);
      if (a) a.status = "cancelled";
    },
    deleteGroup(s, id) {
      const group = s.groups.find((g) => g.id === id);
      if (!group || group.archivedAt) return false;
      group.archivedAt = new Date().toISOString();
      return true;
    },
    restoreGroup(s, id) {
      const group = s.groups.find((g) => g.id === id);
      if (!group || !group.archivedAt) return false;
      delete group.archivedAt;
      return true;
    },
    nextId(rows, prefix) {
      const ids = new Set(rows.map((row) => row.id));
      let suffix = 1;
      while (ids.has(prefix + String(suffix).padStart(2, "0"))) suffix++;
      return prefix + String(suffix).padStart(2, "0");
    },
    csv(rows, keys) {
      return [
        keys.join(","),
        ...rows.map((r) => keys.map((k) => String(r[k] ?? "")).join(",")),
      ].join("\r\n");
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
          budget: "number",
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
        if (
          !Array.isArray(data[collection]) ||
          !data[collection].every((row) => {
            if (!row || typeof row !== "object" || Array.isArray(row))
              return false;
            return Object.entries(schema).every(([key, type]) => {
              const value = row[key];
              if (Array.isArray(type)) return type.includes(value);
              if (type === "number") return Number.isFinite(value);
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

      if (
        data.applications.some(
          (a) =>
            (a.reapprovalPending !== undefined &&
              typeof a.reapprovalPending !== "boolean") ||
            (a.changeHistory !== undefined && !Array.isArray(a.changeHistory)),
        )
      )
        return false;

      return D.validateUniqueIds(data);
    },
    validateUniqueIds(data) {
      const collections = [
        "groups",
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
    amountValue(value) {
      return Number(value);
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
      return s.groups
        .filter((g) => !g.archivedAt)
        .reduce((n, g) => n + Number(g.members), 0);
    },
    taskOrder(rows) {
      return [...rows].sort((a, b) => a.due.localeCompare(b.due));
    },
    // 承認後に変更すると再承認が必要になる重要項目（会場予約へ反映される項目）
    reapprovalFields: ["groupId", "venueId", "date", "start", "end", "attendees"],
    // 承認済み申請の変更履歴に記録する項目
    trackedApplicationFields: [
      "title",
      "groupId",
      "venueId",
      "date",
      "start",
      "end",
      "attendees",
      "note",
    ],
    applicationChanges(before, after) {
      return D.trackedApplicationFields
        .filter((k) => String(before[k] ?? "") !== String(after[k] ?? ""))
        .map((k) => ({
          field: k,
          before: before[k] ?? "",
          after: after[k] ?? "",
        }));
    },
    // 承認済み（または再承認待ち）の申請を編集したときの処理。
    // 重要項目が変わった場合は承認を外し、関連する会場予約を再承認まで取り消す。
    applyApplicationEdit(s, before, after) {
      if (!before) return false;
      const changes = D.applicationChanges(before, after);
      const wasApproved = before.status === "approved";
      const reapproval =
        wasApproved &&
        changes.some((c) => D.reapprovalFields.includes(c.field));
      if (reapproval) {
        after.status = "submitted";
        after.reapprovalPending = true;
        s.reservations.forEach((r) => {
          if (r.applicationId === after.id && r.status !== "cancelled")
            r.status = "cancelled";
        });
      }
      if ((wasApproved || before.reapprovalPending) && changes.length)
        after.changeHistory = [
          ...(before.changeHistory || []),
          {
            at: new Date().toISOString(),
            role: s.role,
            type: reapproval ? "reapprovalRequired" : "edited",
            changes,
          },
        ];
      return reapproval;
    },
    approve(s, id) {
      if (!D.canApprove(s.role)) return false;
      const a = s.applications.find((a) => a.id === id);
      if (!a || a.status === "approved" || a.status === "cancelled")
        return false;
      a.status = "approved";
      const values = {
        venueId: a.venueId,
        groupId: a.groupId,
        date: a.date,
        start: a.start,
        end: a.end,
        attendees: a.attendees,
        status: "approved",
      };
      // 既に関連する予約があれば重複させず、承認した申請内容で更新する
      const linked = s.reservations.find((r) => r.applicationId === a.id);
      if (linked) Object.assign(linked, values);
      else
        s.reservations.push({
          id: D.nextId(s.reservations, "R"),
          applicationId: a.id,
          ...values,
        });
      if (a.reapprovalPending) {
        delete a.reapprovalPending;
        a.changeHistory = [
          ...(a.changeHistory || []),
          {
            at: new Date().toISOString(),
            role: s.role,
            type: "reapproved",
            changes: [],
          },
        ];
      }
      return true;
    },
    validateRequired(r, fields) {
      return fields.every((k) => String(r[k] ?? "").trim().length > 0);
    },
  };
  root.FestivalDomain = D;
  if (typeof module !== "undefined") module.exports = D;
})(typeof window !== "undefined" ? window : globalThis);
