import { OrderActions } from './OrderActions';
import {
  Activity,
  ArrowLeft,
  BadgeDollarSign,
  Ban,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  CreditCard,
  Database,
  Gauge,
  History,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  RefreshCw,
  ScanLine,
  Search,
  Settings2,
  ShieldCheck,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { authClient } from "../auth-client";
import { formatMoney } from "../services/api";
import {
  adminApi,
  type AccountStatus,
  type AdminIdentity,
  type AdminOverview,
  type AdminPayment,
  type AdminPricing,
  type AdminRole,
  type AdminScan,
  type AdminUser,
  type AdminUserDetail,
  type AuditEvent,
  type PageResult,
} from "../services/admin";
import { Brand } from "./Brand";

type Section =
  | "overview"
  | "customers"
  | "scans"
  | "payments"
  | "pricing"
  | "audit";

const sections: Array<{
  id: Section;
  label: string;
  icon: typeof LayoutDashboard;
}> = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "customers", label: "Customers", icon: Users },
  { id: "scans", label: "Scans", icon: ScanLine },
  { id: "payments", label: "Payments", icon: CreditCard },
  { id: "pricing", label: "Pricing", icon: Settings2 },
  { id: "audit", label: "Audit log", icon: History },
];

const shortDate = (date?: string | null) =>
  date
    ? new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium" }).format(
        new Date(date),
      )
    : "—";
const fullDate = (date?: string | null) =>
  date
    ? new Intl.DateTimeFormat("en-ZA", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(date))
    : "—";
const titleCase = (value: string) =>
  value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

function StatusPill({ value }: { value: string }) {
  const tone = ["completed", "available", "active"].includes(value)
    ? "good"
    : [
          "failed",
          "suspended",
          "refunded",
          "removed",
          "needs-attention",
        ].includes(value)
      ? "bad"
      : [
            "processing",
            "queued",
            "uploading",
            "pending",
            "refund_pending",
          ].includes(value)
        ? "live"
        : "neutral";
  return <span className={`admin-status ${tone}`}>{titleCase(value)}</span>;
}

function Pagination({
  page,
  pages,
  onChange,
}: {
  page: number;
  pages: number;
  onChange: (page: number) => void;
}) {
  if (pages <= 1) return null;
  return (
    <div className="admin-pagination">
      <button disabled={page <= 1} onClick={() => onChange(page - 1)}>
        <ChevronLeft size={15} /> Previous
      </button>
      <span>
        Page {page} of {pages}
      </span>
      <button disabled={page >= pages} onClick={() => onChange(page + 1)}>
        Next <ChevronRight size={15} />
      </button>
    </div>
  );
}

function LoadingPanel() {
  return (
    <div className="admin-loading">
      <LoaderCircle className="spin" size={24} />
      <span>Loading administration data…</span>
    </div>
  );
}

function OverviewPanel({
  data,
  onRefresh,
}: {
  data: AdminOverview;
  onRefresh: () => void;
}) {
  const maxActivity = Math.max(
    1,
    ...data.daily.map((day) => Math.max(day.scans, day.users)),
  );
  return (
    <div className="admin-overview">
      <div className="admin-section-heading">
        <div>
          <span>OPERATIONS</span>
          <h1>Platform overview</h1>
          <p>
            Customers, reconstruction activity, and payment performance at a
            glance.
          </p>
        </div>
        <button className="admin-secondary-button" onClick={onRefresh}>
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      {data.developmentBypass && (
        <div className="admin-dev-warning">
          <Gauge size={17} />
          <span>
            <strong>Development payment bypass is active.</strong> Scan and
            revenue figures may include non-billable development activity.
          </span>
        </div>
      )}

      <div className="admin-stat-grid">
        <article>
          <span>
            <Users size={19} />
          </span>
          <div>
            <small>Total customers</small>
            <strong>{data.users.total.toLocaleString()}</strong>
            <p>+{data.users.new_last_30_days} in the last 30 days</p>
          </div>
        </article>
        <article>
          <span>
            <ScanLine size={19} />
          </span>
          <div>
            <small>Generated scans</small>
            <strong>{data.scans.total.toLocaleString()}</strong>
            <p>
              {data.scans.processing} processing · {data.scans.failed} failed
            </p>
          </div>
        </article>
        <article>
          <span>
            <CircleDollarSign size={19} />
          </span>
          <div>
            <small>Collected</small>
            <strong>
              {formatMoney(
                data.payments.collected_cents,
                data.payments.currency,
              )}
            </strong>
            <p>{data.payments.successful} successful payments</p>
          </div>
        </article>
        <article>
          <span className="online">
            <Database size={19} />
          </span>
          <div>
            <small>Processing workflow</small>
            <strong>Manual fulfilment</strong>
            <p>
              Download video, process locally, upload result
            </p>
          </div>
        </article>
      </div>

      <div className="admin-overview-grid">
        <section className="admin-card admin-activity-card">
          <div className="admin-card-heading">
            <div>
              <h2>14-day activity</h2>
              <p>New accounts and scans created each day.</p>
            </div>
            <Activity size={18} />
          </div>
          <div className="admin-chart-legend">
            <span>
              <i className="users" />
              Customers
            </span>
            <span>
              <i className="scans" />
              Scans
            </span>
          </div>
          <div className="admin-bar-chart">
            {data.daily.map((day) => (
              <div
                key={day.day}
                title={`${shortDate(day.day)}: ${day.users} customers, ${day.scans} scans`}>
                <span>
                  <i
                    className="users"
                    style={{
                      height: `${Math.max(2, (day.users / maxActivity) * 100)}%`,
                    }}
                  />
                  <i
                    className="scans"
                    style={{
                      height: `${Math.max(2, (day.scans / maxActivity) * 100)}%`,
                    }}
                  />
                </span>
                <small>{new Date(day.day).getDate()}</small>
              </div>
            ))}
          </div>
        </section>
        <section className="admin-card admin-health-card">
          <div className="admin-card-heading">
            <div>
              <h2>Service health</h2>
              <p>Live operational signals.</p>
            </div>
            <ShieldCheck size={18} />
          </div>
          <div>
            <span>Processing workflow</span>
            <strong>Manual</strong>
          </div>
          <div>
            <span>Scans processing</span>
            <strong>{data.scans.processing}</strong>
          </div>
          <div>
            <span>Pending payments</span>
            <strong>{data.payments.pending}</strong>
          </div>
          <div>
            <span>Suspended accounts</span>
            <strong>{data.users.suspended}</strong>
          </div>
          <div>
            <span>Refunded value</span>
            <strong>
              {formatMoney(
                data.payments.refunded_cents,
                data.payments.currency,
              )}
            </strong>
          </div>
        </section>
      </div>

      <div className="admin-overview-grid">
        <section className="admin-card">
          <div className="admin-card-heading">
            <div>
              <h2>Recent customers</h2>
              <p>Most recently registered accounts.</p>
            </div>
            <Users size={18} />
          </div>
          <div className="admin-compact-list">
            {data.recentUsers.map((user) => (
              <div key={user.id}>
                <span className="admin-avatar">
                  {user.name.slice(0, 2).toUpperCase()}
                </span>
                <div>
                  <strong>{user.name}</strong>
                  <small>{user.email}</small>
                </div>
                <time>{shortDate(user.created_at)}</time>
              </div>
            ))}
          </div>
        </section>
        <section className="admin-card">
          <div className="admin-card-heading">
            <div>
              <h2>Recent scans</h2>
              <p>Latest reconstruction submissions.</p>
            </div>
            <ScanLine size={18} />
          </div>
          <div className="admin-compact-list">
            {data.recentScans.map((scan) => (
              <div key={scan.id}>
                <span className="admin-avatar scan">
                  <ScanLine size={14} />
                </span>
                <div>
                  <strong>{scan.name}</strong>
                  <small>
                    {scan.customer_name} · {titleCase(scan.quality)}
                  </small>
                </div>
                <StatusPill value={scan.status} />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function CustomerDrawer({
  identity,
  detail,
  busy,
  onClose,
  onReload,
  onMessage,
}: {
  identity: AdminIdentity;
  detail: AdminUserDetail;
  busy: boolean;
  onClose: () => void;
  onReload: () => Promise<void>;
  onMessage: (message: string, error?: boolean) => void;
}) {
  const [role, setRole] = useState<AdminRole>(detail.profile.role);
  const [status, setStatus] = useState<AccountStatus>(detail.profile.status);
  const [notes, setNotes] = useState(detail.profile.admin_notes || "");
  const [quality, setQuality] = useState("balanced");
  const [quantity, setQuantity] = useState(1);
  const [creditNote, setCreditNote] = useState("");
  const [saving, setSaving] = useState(false);
  const isSelf = identity.id === detail.profile.id;

  const saveAccess = async () => {
    setSaving(true);
    try {
      await adminApi.updateAccess(detail.profile.id, {
        role,
        status,
        adminNotes: notes,
      });
      onMessage("Customer access settings saved.");
      await onReload();
    } catch (error) {
      onMessage(
        error instanceof Error ? error.message : "Could not update access.",
        true,
      );
    } finally {
      setSaving(false);
    }
  };
  const grant = async () => {
    setSaving(true);
    try {
      await adminApi.grantCredits(detail.profile.id, {
        quality,
        quantity,
        note: creditNote,
      });
      setCreditNote("");
      onMessage(
        `${quantity} ${titleCase(quality)} credit${quantity === 1 ? "" : "s"} granted.`,
      );
      await onReload();
    } catch (error) {
      onMessage(
        error instanceof Error ? error.message : "Could not grant credits.",
        true,
      );
    } finally {
      setSaving(false);
    }
  };
  const revoke = async (payment: AdminPayment) => {
    if (
      !window.confirm(
        `Revoke this unused ${titleCase(payment.quality)} credit?`,
      )
    )
      return;
    setSaving(true);
    try {
      await adminApi.revokeCredit(payment.id);
      onMessage("Manual credit revoked.");
      await onReload();
    } catch (error) {
      onMessage(
        error instanceof Error ? error.message : "Could not revoke credit.",
        true,
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="admin-drawer-backdrop"
      onMouseDown={(event) =>
        event.currentTarget === event.target && onClose()
      }>
      <aside
        className="admin-customer-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`Customer details for ${detail.profile.name}`}>
        <header>
          <div>
            <span>Customer record</span>
            <h2>{detail.profile.name}</h2>
            <p>{detail.profile.email}</p>
          </div>
          <button onClick={onClose} aria-label="Close customer details">
            <X size={19} />
          </button>
        </header>
        <div className="admin-drawer-body">
          <div className="admin-customer-summary">
            <div>
              <small>Joined</small>
              <strong>{shortDate(detail.profile.created_at)}</strong>
            </div>
            <div>
              <small>Sessions</small>
              <strong>{detail.sessions}</strong>
            </div>
            <div>
              <small>Scans</small>
              <strong>{detail.scans.length}</strong>
            </div>
            <div>
              <small>Email</small>
              <strong>
                {detail.profile.email_verified ? "Verified" : "Unverified"}
              </strong>
            </div>
          </div>

          <section className="admin-drawer-section">
            <h3>Access control</h3>
            <p>
              Changes apply at the Express API even when Nginx permits the
              request.
            </p>
            <div className="admin-form-grid">
              <label>
                Role
                <select
                  value={role}
                  disabled={isSelf}
                  onChange={(event) =>
                    setRole(event.target.value as AdminRole)
                  }>
                  <option value="customer">Customer</option>
                  <option value="admin">Administrator</option>
                </select>
              </label>
              <label>
                Status
                <select
                  value={status}
                  disabled={isSelf}
                  onChange={(event) =>
                    setStatus(event.target.value as AccountStatus)
                  }>
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                </select>
              </label>
            </div>
            <label>
              Internal support notes
              <textarea
                value={notes}
                maxLength={2000}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Visible only to administrators"
              />
            </label>
            {isSelf && (
              <small className="admin-form-hint">
                You cannot demote or suspend your own account.
              </small>
            )}
            <button
              className="admin-primary-button"
              disabled={saving || busy}
              onClick={() => void saveAccess()}>
              {saving ? (
                <LoaderCircle className="spin" size={15} />
              ) : (
                <UserCheck size={15} />
              )}{" "}
              Save access
            </button>
          </section>

          <section className="admin-drawer-section">
            <h3>Grant scan credits</h3>
            <p>Use Payments to confirm EFT orders. These are complimentary credits with no payment recorded.</p>
            <div className="admin-form-grid">
              <label>
                Quality
                <select
                  value={quality}
                  onChange={(event) => setQuality(event.target.value)}>
                  <option value="quick">Quick</option>
                  <option value="preview">Preview</option>
                  <option value="balanced">Balanced</option>
                  <option value="high">High</option>
                  <option value="maximum">Maximum</option>
                </select>
              </label>
              <label>
                Quantity
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={quantity}
                  onChange={(event) =>
                    setQuantity(
                      Math.max(1, Math.min(20, Number(event.target.value))),
                    )
                  }
                />
              </label>
            </div>
            <label>
              Reason
              <input
                value={creditNote}
                maxLength={500}
                onChange={(event) => setCreditNote(event.target.value)}
                placeholder="Support adjustment, promotion…"
              />
            </label>
            <button
              className="admin-primary-button"
              disabled={saving}
              onClick={() => void grant()}>
              <BadgeDollarSign size={15} /> Grant credit
            </button>
          </section>

          <section className="admin-drawer-section">
            <h3>Credit and payment history</h3>
            {detail.credits.length ? (
              <div className="admin-drawer-list">
                {detail.credits.map((credit) => (
                  <div key={credit.id}>
                    <span>
                      <strong>{titleCase(credit.quality)}</strong>
                      <small>
                        {credit.manual
                          ? "Manual grant"
                          : credit.development
                            ? "Development token · No charge"
                            : formatMoney(
                                credit.amount_cents,
                                credit.currency,
                              )}{" "}
                        · {shortDate(credit.created_at)}
                      </small>
                    </span>
                    <span>
                      <StatusPill value={credit.status} />
                      {credit.manual && credit.status === "available" && (
                        <button
                          className="admin-inline-danger"
                          onClick={() => void revoke(credit)}>
                          Revoke
                        </button>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="admin-empty-copy">
                No credits or payments recorded.
              </p>
            )}
          </section>

          <section className="admin-drawer-section">
            <h3>Scan history</h3>
            {detail.scans.length ? (
              <div className="admin-drawer-list">
                {detail.scans.map((scan) => (
                  <div key={scan.id}>
                    <span>
                      <strong>{scan.name}</strong>
                      <small>
                        {titleCase(scan.quality)} · {shortDate(scan.created_at)}
                      </small>
                    </span>
                    <StatusPill
                      value={scan.deleted_at ? "removed" : scan.status}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="admin-empty-copy">
                This customer has not created a scan.
              </p>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}

interface CollectionProps<T> {
  data: PageResult<T> | null;
  search: string;
  setSearch: (value: string) => void;
  page: number;
  setPage: (page: number) => void;
}

function CustomersPanel({
  data,
  search,
  setSearch,
  page,
  setPage,
  status,
  setStatus,
  role,
  setRole,
  onSelect,
}: CollectionProps<AdminUser> & {
  status: string;
  setStatus: (value: string) => void;
  role: string;
  setRole: (value: string) => void;
  onSelect: (id: string) => void;
}) {
  return (
    <div>
      <PanelHeading
        title="Customers"
        description="Search accounts, review usage, manage roles, suspend access, and issue credits."
      />
      <AdminFilters search={search} setSearch={setSearch}>
        <select
          aria-label="Account status"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}>
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
        <select
          aria-label="Account role"
          value={role}
          onChange={(event) => {
            setRole(event.target.value);
            setPage(1);
          }}>
          <option value="all">All roles</option>
          <option value="customer">Customers</option>
          <option value="admin">Administrators</option>
        </select>
      </AdminFilters>
      {!data ? (
        <LoadingPanel />
      ) : (
        <>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Access</th>
                  <th>Scans</th>
                  <th>Credits</th>
                  <th>Paid</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((user) => (
                  <tr
                    key={user.id}
                    onClick={() => onSelect(user.id)}
                    tabIndex={0}
                    onKeyDown={(event) =>
                      event.key === "Enter" && onSelect(user.id)
                    }>
                    <td>
                      <span className="admin-person">
                        <i>{user.name.slice(0, 2).toUpperCase()}</i>
                        <span>
                          <strong>{user.name}</strong>
                          <small>{user.email}</small>
                        </span>
                      </span>
                    </td>
                    <td>
                      <span className="admin-pill-stack">
                        <StatusPill value={user.status} />
                        <small>{titleCase(user.role)}</small>
                      </span>
                    </td>
                    <td>
                      <strong>{user.scans_total}</strong>
                      <small>
                        {user.scans_processing
                          ? `${user.scans_processing} active`
                          : `${user.scans_completed} completed`}
                      </small>
                    </td>
                    <td>{user.available_credits}</td>
                    <td>{formatMoney(user.paid_cents, "zar")}</td>
                    <td>{shortDate(user.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.items.length && (
              <div className="admin-empty-copy">
                No customers match these filters.
              </div>
            )}
          </div>
          <Pagination page={page} pages={data.pages} onChange={setPage} />
        </>
      )}
    </div>
  );
}

function ScansPanel({
  data,
  search,
  setSearch,
  page,
  setPage,
  status,
  setStatus,
  quality,
  setQuality,
  onVisibility,
  onUpdated,
}: CollectionProps<AdminScan> & {
  status: string;
  setStatus: (value: string) => void;
  quality: string;
  setQuality: (value: string) => void;
  onVisibility: (scan: AdminScan) => void;
  onUpdated: () => Promise<void>;
}) {
  return (
    <div>
      <PanelHeading
        title="Scans"
        description="Download submitted videos, process them locally, and upload finished splats to the matching customer order."
      />
      <AdminFilters search={search} setSearch={setSearch}>
        <select
          aria-label="Scan status"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}>
          <option value="all">All statuses</option>
          <option value="queued">Submitted</option>
          <option value="uploading">Uploading</option>
          <option value="processing">Processing</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="removed">Removed</option>
        </select>
        <select
          aria-label="Scan quality"
          value={quality}
          onChange={(event) => {
            setQuality(event.target.value);
            setPage(1);
          }}>
          <option value="all">All qualities</option>
          <option value="quick">Quick</option>
          <option value="preview">Preview</option>
          <option value="balanced">Balanced</option>
          <option value="high">High</option>
          <option value="maximum">Maximum</option>
        </select>
      </AdminFilters>
      {!data ? (
        <LoadingPanel />
      ) : (
        <>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Scan</th>
                  <th>Customer</th>
                  <th>Build</th>
                  <th>Status</th>
                  <th>Progress</th>
                  <th>Created</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.items.map((scan) => (
                  <tr key={scan.id}>
                    <td>
                      <strong>{scan.name}</strong>
                      <small>{scan.location || "Location not added"}</small>
                    </td>
                    <td>
                      <strong>{scan.customer_name}</strong>
                      <small>{scan.customer_email}</small>
                    </td>
                    <td>
                      <strong>{titleCase(scan.quality)}</strong>
                      <small>
                        {scan.custom_tuning
                          ? `${scan.target_frames} frames · ${scan.train_steps} steps / ${scan.downscale_factor}x downscale`
                          : titleCase(scan.entitlement_type || "")}
                      </small>
                    </td>
                    <td>
                      <StatusPill
                        value={scan.deleted_at ? "removed" : scan.status}
                      />
                      {scan.error && (
                        <small className="admin-error-copy" title={scan.error}>
                          {scan.error}
                        </small>
                      )}
                    </td>
                    <td>
                      <span className="admin-progress">
                        <i style={{ width: `${scan.progress}%` }} />
                      </span>
                      <small>{scan.progress}%</small>
                    </td>
                    <td>{shortDate(scan.created_at)}</td>
                    <td>
                      <OrderActions scan={scan} onUpdated={onUpdated} />
                      <button
                        className={
                          scan.deleted_at
                            ? "admin-inline-button"
                            : "admin-inline-danger"
                        }
                        onClick={() => onVisibility(scan)}>
                        {scan.deleted_at ? "Restore" : "Remove"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.items.length && (
              <div className="admin-empty-copy">
                No scans match these filters.
              </div>
            )}
          </div>
          <Pagination page={page} pages={data.pages} onChange={setPage} />
        </>
      )}
    </div>
  );
}

function PaymentsPanel({
  data,
  search,
  setSearch,
  page,
  setPage,
  status,
  setStatus,
  onAction,
}: CollectionProps<AdminPayment> & {
  status: string;
  setStatus: (value: string) => void;
  onAction: (payment: AdminPayment) => void;
}) {
  return (
    <div>
      <PanelHeading
        title="Payments"
        description="Confirm EFT receipts against the quoted amount and order reference. Credits become available only after confirmation."
      />
      <AdminFilters search={search} setSearch={setSearch}>
        <select
          aria-label="Payment status"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}>
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="available">Available</option>
          <option value="consumed">Consumed</option>
          <option value="refund_pending">Refund pending</option>
          <option value="refunded">Refunded</option>
        </select>
      </AdminFilters>
      {!data ? (
        <LoadingPanel />
      ) : (
        <>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Quality</th>
                  <th>Amount</th>
                  <th>Provider</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.items.map((payment) => (
                  <tr key={payment.id}>
                    <td>
                      <strong>{payment.customer_name}</strong>
                      <small>{payment.customer_email}</small>
                    </td>
                    <td>{titleCase(payment.quality)}</td>
                    <td>
                      <strong>
                        {payment.manual || payment.development
                          ? "No charge"
                          : formatMoney(payment.amount_cents, payment.currency)}
                      </strong>
                      <small>{payment.provider_reference}</small>
                    </td>
                    <td>
                      <strong>
                        {payment.manual
                          ? "Manual credit"
                          : payment.development
                            ? "Development token"
                            : titleCase(payment.provider)}
                      </strong>
                      <small>
                        {payment.payment_channel
                          ? titleCase(payment.payment_channel)
                          : payment.provider_transaction_id || ""}
                      </small>
                    </td>
                    <td>
                      <StatusPill value={payment.status} />
                      {payment.refund_status && (
                        <small>
                          Refund: {titleCase(payment.refund_status)}
                        </small>
                      )}
                    </td>
                    <td>{fullDate(payment.created_at)}</td>
                    <td>
                      {payment.manual && payment.status === "available" ? (
                        <button
                          className="admin-inline-danger"
                          onClick={() => onAction(payment)}>
                          Revoke
                        </button>
                      ) : payment.provider === "eft" && payment.status === "pending" ? (
                        <button
                          className="admin-inline-danger"
                          onClick={() => onAction(payment)}>
                          Confirm EFT
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.items.length && (
              <div className="admin-empty-copy">
                No payments match these filters.
              </div>
            )}
          </div>
          <Pagination page={page} pages={data.pages} onChange={setPage} />
        </>
      )}
    </div>
  );
}

type PriceKey = "quick" | "preview" | "balanced" | "high" | "maximum";

function PricingPanel({
  data,
  saving,
  onSave,
}: {
  data: AdminPricing | null;
  saving: boolean;
  onSave: (prices: Record<PriceKey, number>) => Promise<void>;
}) {
  const [values, setValues] = useState<Record<PriceKey, string>>({
    quick: "",
    preview: "",
    balanced: "",
    high: "",
    maximum: "",
  });

  useEffect(() => {
    if (!data) return;
    setValues(
      Object.fromEntries(
        data.qualities.map((quality) => [
          quality.id,
          (quality.priceCents / 100).toFixed(2),
        ]),
      ) as Record<PriceKey, string>,
    );
  }, [data]);

  if (!data) return <LoadingPanel />;
  const save = async () => {
    const entries = Object.entries(values).map(([quality, value]) => [
      quality,
      Math.round(Number(value) * 100),
    ]);
    if (
      entries.some(([, value]) => !Number.isFinite(value) || Number(value) < 0)
    )
      return;
    await onSave(Object.fromEntries(entries) as Record<PriceKey, number>);
  };
  return (
    <div>
      <PanelHeading
        title="Pricing"
        description="Set the live token price for every reconstruction quality. Changes apply immediately to quotes and new EFT orders."
      />
      <div className="admin-dev-warning">
        <BadgeDollarSign size={17} />
        <span>
          <strong>Prices are stored in the database.</strong> Customers pay the quoted amount by EFT. Pending orders keep their original price.
        </span>
      </div>
      <section className="admin-card admin-pricing-card">
        <div className="admin-card-heading">
          <div>
            <h2>Scan token prices</h2>
            <p>
              Enter customer-facing amounts in {data.currency.toUpperCase()}.
            </p>
          </div>
          <Settings2 size={18} />
        </div>
        <div className="admin-price-grid">
          {data.qualities.map((quality) => (
            <label key={quality.id}>
              <span>
                <strong>{quality.name}</strong>
                <small>One {quality.name.toLowerCase()} scan token</small>
              </span>
              <div>
                <b>{data.currency.toUpperCase()}</b>
                <input
                  aria-label={`${quality.name} price`}
                  type="number"
                  min="0"
                  max="1000000"
                  step="0.01"
                  value={values[quality.id]}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      [quality.id]: event.target.value,
                    }))
                  }
                />
              </div>
            </label>
          ))}
        </div>
        <div className="admin-pricing-actions">
          <p>Existing tokens and completed payments are not repriced.</p>
          <button
            className="admin-primary-button"
            disabled={saving}
            onClick={() => void save()}>
            {saving ? (
              <LoaderCircle className="spin" size={15} />
            ) : (
              <CheckCircle2 size={15} />
            )}{" "}
            Save all prices
          </button>
        </div>
      </section>
    </div>
  );
}

function AuditPanel({
  data,
  search,
  setSearch,
  page,
  setPage,
}: CollectionProps<AuditEvent>) {
  return (
    <div>
      <PanelHeading
        title="Audit log"
        description="An immutable record of administrator access, credit, payment, and scan actions."
      />
      <AdminFilters search={search} setSearch={setSearch} />
      {!data ? (
        <LoadingPanel />
      ) : (
        <>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Administrator</th>
                  <th>Action</th>
                  <th>Target</th>
                  <th>Context</th>
                  <th>IP address</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((event) => (
                  <tr key={event.id}>
                    <td>{event.actor_email}</td>
                    <td>
                      <strong>
                        {titleCase(event.action.replace(".", " "))}
                      </strong>
                    </td>
                    <td>
                      <strong>{titleCase(event.target_type)}</strong>
                      <small>{event.target_id}</small>
                    </td>
                    <td>
                      <code>
                        {JSON.stringify(event.metadata).slice(0, 140)}
                      </code>
                    </td>
                    <td>{event.ip_address || "—"}</td>
                    <td>{fullDate(event.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.items.length && (
              <div className="admin-empty-copy">
                No administrator actions have been recorded yet.
              </div>
            )}
          </div>
          <Pagination page={page} pages={data.pages} onChange={setPage} />
        </>
      )}
    </div>
  );
}

function PanelHeading({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="admin-section-heading">
      <div>
        <span>ADMINISTRATION</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
    </div>
  );
}

function AdminFilters({
  search,
  setSearch,
  children,
}: {
  search: string;
  setSearch: (value: string) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="admin-filters">
      <label>
        <Search size={16} />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name, email, or reference"
        />
      </label>
      {children}
    </div>
  );
}

export function AdminDashboard({ identity }: { identity: AdminIdentity }) {
  const [section, setSection] = useState<Section>("overview");
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<PageResult<AdminUser> | null>(null);
  const [scans, setScans] = useState<PageResult<AdminScan> | null>(null);
  const [payments, setPayments] = useState<PageResult<AdminPayment> | null>(
    null,
  );
  const [pricing, setPricing] = useState<AdminPricing | null>(null);
  const [events, setEvents] = useState<PageResult<AuditEvent> | null>(null);
  const [search, setSearchValue] = useState("");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("all");
  const [role, setRole] = useState("all");
  const [quality, setQuality] = useState("all");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [userDetail, setUserDetail] = useState<AdminUserDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    text: string;
    error: boolean;
  } | null>(null);

  const notify = useCallback((text: string, error = false) => {
    setMessage({ text, error });
    window.setTimeout(() => setMessage(null), 3600);
  }, []);

  const loadOverview = useCallback(async () => {
    setOverview(null);
    try {
      setOverview(await adminApi.overview());
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Could not load the overview.",
        true,
      );
    }
  }, [notify]);

  const filters = useMemo(
    () => ({ page, limit: 25, search, status, role, quality }),
    [page, quality, role, search, status],
  );

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);
  useEffect(() => {
    if (section === "overview") return;
    const timer = window.setTimeout(() => {
      if (section === "customers") {
        setUsers(null);
        void adminApi
          .users(filters)
          .then(setUsers)
          .catch((error) => notify(error.message, true));
      }
      if (section === "scans") {
        setScans(null);
        void adminApi
          .scans(filters)
          .then(setScans)
          .catch((error) => notify(error.message, true));
      }
      if (section === "payments") {
        setPayments(null);
        void adminApi
          .payments(filters)
          .then(setPayments)
          .catch((error) => notify(error.message, true));
      }
      if (section === "pricing") {
        setPricing(null);
        void adminApi
          .pricing()
          .then(setPricing)
          .catch((error) => notify(error.message, true));
      }
      if (section === "audit") {
        setEvents(null);
        void adminApi
          .audit(filters)
          .then(setEvents)
          .catch((error) => notify(error.message, true));
      }
    }, 220);
    return () => window.clearTimeout(timer);
  }, [filters, notify, section]);

  const changeSection = (next: Section) => {
    setSection(next);
    setSearchValue("");
    setPage(1);
    setStatus("all");
    setRole("all");
    setQuality("all");
  };
  const setSearch = (value: string) => {
    setSearchValue(value);
    setPage(1);
  };
  const loadUser = useCallback(
    async (id: string) => {
      setSelectedUserId(id);
      setUserDetail(null);
      setBusy(true);
      try {
        setUserDetail(await adminApi.user(id));
      } catch (error) {
        notify(
          error instanceof Error ? error.message : "Could not load customer.",
          true,
        );
        setSelectedUserId(null);
      } finally {
        setBusy(false);
      }
    },
    [notify],
  );

  const toggleScan = async (scan: AdminScan) => {
    const removing = !scan.deleted_at;
    if (
      removing &&
      !window.confirm(
        `Remove “${scan.name}” from the customer's workspace? The record and model are retained and can be restored.`,
      )
    )
      return;
    setBusy(true);
    try {
      await adminApi.setScanRemoved(scan.id, removing);
      notify(
        removing
          ? "Scan removed from the customer workspace."
          : "Scan restored.",
      );
      setScans(await adminApi.scans(filters));
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "Could not update scan visibility.",
        true,
      );
    } finally {
      setBusy(false);
    }
  };

  const paymentAction = async (payment: AdminPayment) => {
    let bankReference = '';
    if (payment.provider === 'eft') {
      const entered = window.prompt(`Confirm receipt of ${formatMoney(payment.amount_cents, payment.currency)} from ${payment.customer_email} for order ${payment.provider_reference}. Enter the bank transaction reference:`);
      if (!entered?.trim()) return;
      bankReference = entered.trim();
    } else if (!window.confirm('Revoke this unused manual credit?')) return;
    setBusy(true);
    try {
      if (payment.provider === 'eft') await adminApi.confirmEft(payment.id, bankReference);
      else await adminApi.revokeCredit(payment.id);
      notify(payment.provider === 'eft' ? 'EFT confirmed. Customer credit added.' : 'Manual credit revoked.');
      setPayments(await adminApi.payments(filters));
    } catch (error) { notify(error instanceof Error ? error.message : 'Payment action failed.', true); }
    finally { setBusy(false); }
  };

  const savePricing = async (prices: Record<PriceKey, number>) => {
    setBusy(true);
    try {
      setPricing(await adminApi.updatePricing(prices));
      notify("Customer token prices updated.");
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Could not update prices.",
        true,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <Brand />
          <span>ADMIN</span>
        </div>
        <nav>
          {sections.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={section === id ? "active" : ""}
              onClick={() => changeSection(id)}>
              <Icon size={17} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="admin-sidebar-spacer" />
        <div className="admin-identity">
          <span>{identity.name.slice(0, 2).toUpperCase()}</span>
          <div>
            <strong>{identity.name}</strong>
            <small>{identity.email}</small>
          </div>
        </div>
        <Link className="admin-back-link" to="/app">
          <ArrowLeft size={15} /> Customer workspace
        </Link>
        <button
          className="admin-signout"
          onClick={() =>
            void authClient.signOut({
              fetchOptions: {
                onSuccess: () =>
                  window.location.assign("/login?returnTo=/admin"),
              },
            })
          }>
          <LogOut size={15} /> Sign out
        </button>
      </aside>
      <main className="admin-main">
        {section === "overview" &&
          (overview ? (
            <OverviewPanel
              data={overview}
              onRefresh={() => void loadOverview()}
            />
          ) : (
            <LoadingPanel />
          ))}
        {section === "customers" && (
          <CustomersPanel
            data={users}
            search={search}
            setSearch={setSearch}
            page={page}
            setPage={setPage}
            status={status}
            setStatus={setStatus}
            role={role}
            setRole={setRole}
            onSelect={(id) => void loadUser(id)}
          />
        )}
        {section === "scans" && (
          <ScansPanel
            data={scans}
            search={search}
            setSearch={setSearch}
            page={page}
            setPage={setPage}
            status={status}
            setStatus={setStatus}
            quality={quality}
            setQuality={setQuality}
            onVisibility={(scan) => void toggleScan(scan)}
            onUpdated={async () => { setScans(await adminApi.scans(filters)); }}
          />
        )}
        {section === "payments" && (
          <PaymentsPanel
            data={payments}
            search={search}
            setSearch={setSearch}
            page={page}
            setPage={setPage}
            status={status}
            setStatus={setStatus}
            onAction={(payment) => void paymentAction(payment)}
          />
        )}
        {section === "pricing" && (
          <PricingPanel data={pricing} saving={busy} onSave={savePricing} />
        )}
        {section === "audit" && (
          <AuditPanel
            data={events}
            search={search}
            setSearch={setSearch}
            page={page}
            setPage={setPage}
          />
        )}
      </main>
      {selectedUserId && userDetail && (
        <CustomerDrawer
          identity={identity}
          detail={userDetail}
          busy={busy}
          onClose={() => {
            setSelectedUserId(null);
            setUserDetail(null);
          }}
          onReload={() => loadUser(selectedUserId)}
          onMessage={notify}
        />
      )}
      {selectedUserId && !userDetail && (
        <div className="admin-drawer-backdrop">
          <LoadingPanel />
        </div>
      )}
      {message && (
        <div className={`admin-toast ${message.error ? "error" : ""}`}>
          {message.error ? <Ban size={16} /> : <CheckCircle2 size={16} />}
          {message.text}
        </div>
      )}
      {busy && (
        <div className="admin-busy-indicator">
          <LoaderCircle className="spin" size={15} /> Applying change…
        </div>
      )}
    </div>
  );
}
