import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { adminApi } from "../../lib/adminApiClient.js";
import { useAuth } from "../../context/AuthContext.jsx";

// ---------------------------------------------------------------------------
// Permission toggle (Telegram-style)
// ---------------------------------------------------------------------------
function PermToggle({ label, checked, onChange, disabled }) {
  return (
    <label
      className={`flex items-center justify-between gap-3 py-2 px-3 rounded-lg cursor-pointer transition-colors ${
        disabled ? "opacity-40 cursor-not-allowed" : "hover:bg-gray-800"
      }`}
    >
      <span className="text-sm text-gray-300">{label}</span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none ${
          checked ? "bg-blue-600" : "bg-gray-600"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Password modal
// ---------------------------------------------------------------------------
function PasswordModal({ title, description, onConfirm, onCancel, loading, extra }) {
  const [password, setPassword] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <h3 className="text-lg font-bold text-white mb-1">{title}</h3>
        {description && <p className="text-sm text-gray-400 mb-4">{description}</p>}
        {extra}
        <input
          autoFocus
          type="password"
          placeholder="Admin panel paroli"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onConfirm(password)}
          className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 mb-4"
        />
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            disabled={loading}
            className="bg-gray-700 hover:bg-gray-600 text-gray-200 px-4 py-2 rounded-lg text-sm transition-colors"
          >
            Bekor
          </button>
          <button
            onClick={() => onConfirm(password)}
            disabled={loading || !password}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            {loading ? "..." : "Tasdiqlash"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Change password modal
// ---------------------------------------------------------------------------
function ChangePasswordModal({ onConfirm, onCancel, loading }) {
  const [oldPass, setOldPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [newPass2, setNewPass2] = useState("");

  const mismatch = newPass2 && newPass !== newPass2;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <h3 className="text-lg font-bold text-white mb-4">Parolni o'zgartirish</h3>
        <div className="space-y-3 mb-4">
          <input
            autoFocus
            type="password"
            placeholder="Eski parol"
            value={oldPass}
            onChange={(e) => setOldPass(e.target.value)}
            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
          <input
            type="password"
            placeholder="Yangi parol"
            value={newPass}
            onChange={(e) => setNewPass(e.target.value)}
            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
          <input
            type="password"
            placeholder="Yangi parolni takrorlang"
            value={newPass2}
            onChange={(e) => setNewPass2(e.target.value)}
            className={`w-full bg-gray-800 border rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none ${
              mismatch ? "border-red-500" : "border-gray-600 focus:border-blue-500"
            }`}
          />
          {mismatch && <p className="text-xs text-red-400">Parollar mos emas</p>}
        </div>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            disabled={loading}
            className="bg-gray-700 hover:bg-gray-600 text-gray-200 px-4 py-2 rounded-lg text-sm transition-colors"
          >
            Bekor
          </button>
          <button
            onClick={() => onConfirm(oldPass, newPass)}
            disabled={loading || !oldPass || !newPass || mismatch || newPass.length < 4}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            {loading ? "..." : "O'zgartirish"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function AdminTeamPage() {
  const { user } = useAuth();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Modal states
  const [addModal, setAddModal] = useState(false);
  const [addIdentifier, setAddIdentifier] = useState(""); // email yoki username
  const [addPerms, setAddPerms] = useState({ can_manage_problems: true, can_view_users: true, can_manage_admins: false });
  const [addLoading, setAddLoading] = useState(false);

  const [removeTarget, setRemoveTarget] = useState(null); // member object
  const [removeLoading, setRemoveLoading] = useState(false);

  const [transferModal, setTransferModal] = useState(false);
  const [transferEmail, setTransferEmail] = useState("");
  const [transferLoading, setTransferLoading] = useState(false);

  const [changePassModal, setChangePassModal] = useState(false);
  const [changePassLoading, setChangePassLoading] = useState(false);

  const currentIsOwner = members.find((m) => m.email === user?.email)?.is_owner ?? false;

  const flash = (msg, isError = false) => {
    if (isError) setError(msg);
    else setSuccessMsg(msg);
    setTimeout(() => {
      setError("");
      setSuccessMsg("");
    }, 4000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi.team.list();
      setMembers(data || []);
    } catch (err) {
      setError(err.message || "Yuklanmadi");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // --- Permission toggle ---
  async function handlePermChange(memberId, permKey, value) {
    const member = members.find((m) => m.id === memberId);
    if (!member) return;
    const newPerms = { ...member.permissions, [permKey]: value };
    try {
      await adminApi.team.updatePermissions(memberId, newPerms);
      setMembers((prev) =>
        prev.map((m) => (m.id === memberId ? { ...m, permissions: newPerms } : m))
      );
    } catch (err) {
      flash(err.message || "O'zgartirishda xato", true);
    }
  }

  // --- Add admin ---
  async function handleAddAdmin(password) {
    if (!addIdentifier.trim()) return;
    setAddLoading(true);
    try {
      await adminApi.team.add({ identifier: addIdentifier.trim(), password, permissions: addPerms });
      setAddModal(false);
      setAddIdentifier("");
      flash("Admin muvaffaqiyatli qo'shildi!");
      load();
    } catch (err) {
      flash(err.message || "Qo'shishda xato", true);
    } finally {
      setAddLoading(false);
    }
  }

  // --- Remove admin ---
  async function handleRemoveAdmin(password) {
    if (!removeTarget) return;
    setRemoveLoading(true);
    try {
      await adminApi.team.remove(removeTarget.id, password);
      setRemoveTarget(null);
      flash(`${removeTarget.username} admin huquqidan mahrum qilindi.`);
      load();
    } catch (err) {
      flash(err.message || "O'chirishda xato", true);
    } finally {
      setRemoveLoading(false);
    }
  }

  // --- Transfer ownership ---
  async function handleTransfer(password) {
    if (!transferEmail.trim()) return;
    setTransferLoading(true);
    try {
      await adminApi.team.transferOwnership({ target_email: transferEmail.trim(), password });
      setTransferModal(false);
      setTransferEmail("");
      flash("Egalik muvaffaqiyatli topshirildi!");
      load();
    } catch (err) {
      flash(err.message || "Topshirishda xato", true);
    } finally {
      setTransferLoading(false);
    }
  }

  // --- Change password ---
  async function handleChangePassword(oldPass, newPass) {
    setChangePassLoading(true);
    try {
      await adminApi.team.changePassword({ old_password: oldPass, new_password: newPass });
      setChangePassModal(false);
      flash("Parol muvaffaqiyatli o'zgartirildi!");
    } catch (err) {
      flash(err.message || "O'zgartirishda xato", true);
    } finally {
      setChangePassLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Modals */}
      {addModal && (
        <PasswordModal
          title="Yangi admin qo'shish"
          onConfirm={handleAddAdmin}
          onCancel={() => setAddModal(false)}
          loading={addLoading}
          extra={
            <div className="mb-4 space-y-3">
              <input
                type="text"
                placeholder="Username yoki email"
                value={addIdentifier}
                onChange={(e) => setAddIdentifier(e.target.value)}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
              <div className="bg-gray-800 rounded-xl p-2 space-y-1">
                <p className="text-xs text-gray-500 px-2 pb-1">Ruxsatlar</p>
                <PermToggle
                  label="Masalalarni boshqarish"
                  checked={addPerms.can_manage_problems}
                  onChange={(v) => setAddPerms((p) => ({ ...p, can_manage_problems: v }))}
                />
                <PermToggle
                  label="Foydalanuvchilarni ko'rish"
                  checked={addPerms.can_view_users}
                  onChange={(v) => setAddPerms((p) => ({ ...p, can_view_users: v }))}
                />
                <PermToggle
                  label="Adminlarni boshqarish"
                  checked={addPerms.can_manage_admins}
                  onChange={(v) => setAddPerms((p) => ({ ...p, can_manage_admins: v }))}
                />
              </div>
            </div>
          }
        />
      )}

      {removeTarget && (
        <PasswordModal
          title={`${removeTarget.username} ni admin huquqidan mahrum qilish`}
          description="Bu amalni tasdiqlash uchun admin panel parolini kiriting."
          onConfirm={handleRemoveAdmin}
          onCancel={() => setRemoveTarget(null)}
          loading={removeLoading}
        />
      )}

      {transferModal && (
        <PasswordModal
          title="Egaliklarni topshirish"
          description="Egalikni qaysi adminiga topshirmoqchisiz?"
          onConfirm={handleTransfer}
          onCancel={() => { setTransferModal(false); setTransferEmail(""); }}
          loading={transferLoading}
          extra={
            <input
              type="email"
              placeholder="Yangi ega email manzili"
              value={transferEmail}
              onChange={(e) => setTransferEmail(e.target.value)}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 mb-3"
            />
          }
        />
      )}

      {changePassModal && (
        <ChangePasswordModal
          onConfirm={handleChangePassword}
          onCancel={() => setChangePassModal(false)}
          loading={changePassLoading}
        />
      )}

      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-800">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              to="/admin/problems"
              className="text-gray-400 hover:text-white transition-colors text-sm"
            >
              ← Admin
            </Link>
            <span className="text-gray-700">|</span>
            <div>
              <h1 className="text-xl font-bold text-white">Jamoa boshqaruvi</h1>
              <p className="text-sm text-gray-400">Admin huquqlari va ruxsatlar</p>
            </div>
          </div>

          {currentIsOwner && (
            <div className="flex gap-2">
              <button
                onClick={() => setChangePassModal(true)}
                className="text-sm bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 px-3 py-2 rounded-lg transition-colors"
              >
                Parolni o'zgartirish
              </button>
              <button
                onClick={() => setTransferModal(true)}
                className="text-sm bg-yellow-600/20 hover:bg-yellow-600/30 border border-yellow-600/30 text-yellow-400 px-3 py-2 rounded-lg transition-colors"
              >
                Egaliklarni topshirish
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        {/* Messages */}
        {error && (
          <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-4 text-red-400 text-sm">
            {error}
          </div>
        )}
        {successMsg && (
          <div className="bg-green-900/20 border border-green-500/30 rounded-xl p-4 text-green-400 text-sm">
            {successMsg}
          </div>
        )}

        {/* Add Admin button */}
        {currentIsOwner && (
          <div className="flex justify-end">
            <button
              onClick={() => setAddModal(true)}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors"
            >
              + Yangi admin qo'shish
            </button>
          </div>
        )}

        {/* Members list */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-blue-500" />
          </div>
        ) : (
          <div className="space-y-3">
            {members.map((member) => {
              const isMe = member.email === user?.email;
              const isOwner = member.is_owner;

              return (
                <div
                  key={member.id}
                  className="bg-gray-900 border border-gray-800 rounded-2xl p-5"
                >
                  {/* Member header */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm">
                        {member.username[0]?.toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white">{member.username}</span>
                          {isOwner && (
                            <span className="text-xs bg-yellow-400/15 text-yellow-400 border border-yellow-400/20 px-2 py-0.5 rounded-full">
                              EGA
                            </span>
                          )}
                          {isMe && (
                            <span className="text-xs bg-blue-400/15 text-blue-400 border border-blue-400/20 px-2 py-0.5 rounded-full">
                              Men
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-gray-400">{member.email}</div>
                      </div>
                    </div>

                    {/* Remove button — only owner can remove, and only non-owners */}
                    {currentIsOwner && !isOwner && !isMe && (
                      <button
                        onClick={() => setRemoveTarget(member)}
                        className="text-xs text-red-400 hover:text-red-300 border border-red-400/20 hover:border-red-400/40 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        Olib tashlash
                      </button>
                    )}
                  </div>

                  {/* Permissions */}
                  <div className="bg-gray-800/50 rounded-xl p-2 space-y-0.5">
                    <p className="text-xs text-gray-500 px-3 py-1">Ruxsatlar</p>
                    <PermToggle
                      label="Masalalarni boshqarish (qo'shish, tahrirlash, o'chirish)"
                      checked={member.permissions.can_manage_problems}
                      disabled={isOwner || !currentIsOwner}
                      onChange={(v) => handlePermChange(member.id, "can_manage_problems", v)}
                    />
                    <PermToggle
                      label="Foydalanuvchilarni ko'rish"
                      checked={member.permissions.can_view_users}
                      disabled={isOwner || !currentIsOwner}
                      onChange={(v) => handlePermChange(member.id, "can_view_users", v)}
                    />
                    <PermToggle
                      label="Adminlarni boshqarish (qo'shish va o'chirish)"
                      checked={member.permissions.can_manage_admins}
                      disabled={isOwner || !currentIsOwner}
                      onChange={(v) => handlePermChange(member.id, "can_manage_admins", v)}
                    />
                  </div>

                  {isOwner && (
                    <p className="text-xs text-gray-500 mt-2 px-1">
                      Egada barcha ruxsatlar mavjud va ularni o'zgartirib bo'lmaydi.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
