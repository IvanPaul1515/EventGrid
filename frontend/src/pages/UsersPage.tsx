import React, { useState, useEffect, useCallback } from 'react';
import {
  UserCog,
  Shield,
  Plus,
  KeyRound,
  Search,
  Filter,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Copy,
  Check,
  RefreshCw,
  Clock,
  Lock,
  Mail,
  UserCheck,
  UserX,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usersService, UserItem } from '../services/users.service';

export const UsersPage: React.FC = () => {
  const { user: currentUser } = useAuth();

  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filtros
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Modales
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserItem | null>(null);

  // Modal de restablecimiento de contraseña
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetResult, setResetResult] = useState<{ temporaryPassword?: string; message: string } | null>(null);
  const [copiedPass, setCopiedPass] = useState(false);

  // Formulario de creación
  const [createForm, setCreateForm] = useState({
    email: '',
    fullName: '',
    role: 'OPERATOR' as 'ADMIN' | 'OPERATOR' | 'VIEWER',
    password: '',
  });

  // Formulario de edición
  const [editForm, setEditForm] = useState({
    fullName: '',
    role: 'OPERATOR' as 'ADMIN' | 'OPERATOR' | 'VIEWER',
    isActive: true,
  });

  const [submitting, setSubmitting] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params: any = { page, limit: 15 };
      if (search.trim()) params.search = search.trim();
      if (roleFilter !== 'ALL') params.role = roleFilter;
      if (statusFilter === 'ACTIVE') params.isActive = true;
      if (statusFilter === 'INACTIVE') params.isActive = false;

      const res = await usersService.listUsers(params);
      setUsers(res.users);
      setTotalPages(res.pagination.totalPages);
      setTotalCount(res.pagination.total);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Error al cargar listado de usuarios');
    } finally {
      setLoading(false);
    }
  }, [page, search, roleFilter, statusFilter]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      setError(null);

      const res = await usersService.createUser({
        email: createForm.email.trim(),
        fullName: createForm.fullName.trim(),
        role: createForm.role,
        password: createForm.password.trim() || undefined,
      });

      setIsCreateModalOpen(false);
      setCreateForm({ email: '', fullName: '', role: 'OPERATOR', password: '' });

      if (res.temporaryPassword) {
        setResetResult({
          message: `Usuario ${res.user.fullName} creado exitosamente con credencial provisional.`,
          temporaryPassword: res.temporaryPassword,
        });
        setIsResetModalOpen(true);
      } else {
        setSuccessMsg(`Usuario ${res.user.fullName} creado exitosamente.`);
        setTimeout(() => setSuccessMsg(null), 4000);
      }

      fetchUsers();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Error al crear usuario.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenEdit = (u: UserItem) => {
    setSelectedUser(u);
    setEditForm({
      fullName: u.fullName,
      role: u.role,
      isActive: u.isActive,
    });
    setIsEditModalOpen(true);
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    try {
      setSubmitting(true);
      setError(null);

      const updated = await usersService.updateUser(selectedUser.id, editForm);
      setIsEditModalOpen(false);
      setSelectedUser(null);
      setSuccessMsg(`Usuario ${updated.fullName} actualizado correctamente.`);
      setTimeout(() => setSuccessMsg(null), 4000);
      fetchUsers();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Error al actualizar usuario.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (u: UserItem) => {
    try {
      setError(null);
      const updated = await usersService.toggleStatus(u.id);
      setSuccessMsg(`Cuenta de ${updated.fullName} ${updated.isActive ? 'activada' : 'desactivada'} correctamente.`);
      setTimeout(() => setSuccessMsg(null), 3000);
      fetchUsers();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Error al cambiar estado del usuario.');
    }
  };

  const handleResetPassword = async (u: UserItem) => {
    try {
      setError(null);
      setSelectedUser(u);
      const res = await usersService.resetPassword(u.id);
      setResetResult({
        message: `Se ha generado una nueva contraseña temporal de acceso para ${u.fullName}.`,
        temporaryPassword: res.temporaryPassword,
      });
      setIsResetModalOpen(true);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Error al restablecer contraseña.');
    }
  };

  const handleDeleteUser = async (u: UserItem) => {
    if (!window.confirm(`¿Estás seguro de que deseas eliminar la cuenta de ${u.fullName} (${u.email})?`)) {
      return;
    }
    try {
      setError(null);
      const res = await usersService.deleteUser(u.id);
      setSuccessMsg(res.message);
      setTimeout(() => setSuccessMsg(null), 4000);
      fetchUsers();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Error al eliminar usuario.');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPass(true);
    setTimeout(() => setCopiedPass(false), 2000);
  };

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return 'Nunca';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('es-DO', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
              <UserCog className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-foreground">
                Administración de Usuarios y Permisos
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Control centralizado de operadores, auditores y administradores de EventGrid.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchUsers()}
            disabled={loading}
            className="p-2.5 rounded-xl border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="Recargar usuarios"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold flex items-center gap-2 shadow-md transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Nuevo Usuario</span>
          </button>
        </div>
      </div>

      {/* Alertas */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-300">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-emerald-300">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Barra de Filtros y Búsqueda */}
      <div className="p-4 rounded-2xl bg-card border border-border shadow-sm flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar por nombre o correo electrónico..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-muted/50 border border-border text-xs focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary text-foreground"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Filtro por Rol */}
          <div className="flex items-center gap-1.5 bg-muted/40 border border-border rounded-xl px-2.5 py-1.5">
            <Shield className="w-3.5 h-3.5 text-muted-foreground" />
            <select
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                setPage(1);
              }}
              className="bg-transparent text-xs text-foreground focus:outline-none cursor-pointer font-medium"
            >
              <option value="ALL">Todos los roles</option>
              <option value="ADMIN">Administradores</option>
              <option value="OPERATOR">Operadores</option>
              <option value="VIEWER">Auditores (Lectura)</option>
            </select>
          </div>

          {/* Filtro por Estado */}
          <div className="flex items-center gap-1.5 bg-muted/40 border border-border rounded-xl px-2.5 py-1.5">
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="bg-transparent text-xs text-foreground focus:outline-none cursor-pointer font-medium"
            >
              <option value="ALL">Todos los estados</option>
              <option value="ACTIVE">Activos</option>
              <option value="INACTIVE">Inactivos</option>
            </select>
          </div>
        </div>
      </div>

      {/* Contenedor de Usuarios (Desktop Table + Mobile Cards) */}
      <div className="rounded-2xl bg-card border border-border overflow-hidden shadow-sm">
        <div className="p-4 border-b border-border bg-muted/30 flex items-center justify-between text-xs text-muted-foreground font-semibold">
          <span>Usuarios Registrados ({totalCount})</span>
          <span>Página {page} de {totalPages}</span>
        </div>

        {loading ? (
          <div className="p-12 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <RefreshCw className="w-6 h-6 animate-spin text-primary" />
            <span className="text-xs">Cargando cuentas de usuario...</span>
          </div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <UserX className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-xs font-semibold">No se encontraron usuarios coincidentes</p>
            <p className="text-[11px] text-muted-foreground mt-1">Prueba cambiando los filtros de búsqueda.</p>
          </div>
        ) : (
          <>
            {/* Vista Desktop (md+) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/20 text-muted-foreground font-semibold uppercase tracking-wider text-[10px]">
                    <th className="py-3 px-4">Usuario</th>
                    <th className="py-3 px-4">Rol RBAC</th>
                    <th className="py-3 px-4">Estado</th>
                    <th className="py-3 px-4">Último Acceso</th>
                    <th className="py-3 px-4">Creado</th>
                    <th className="py-3 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {users.map((u) => {
                    const isSelf = currentUser?.id === u.id;
                    return (
                      <tr key={u.id} className="hover:bg-muted/30 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary font-bold flex items-center justify-center text-xs shrink-0">
                              {u.fullName.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-foreground">{u.fullName}</span>
                                {isSelf && (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-primary/20 text-primary">
                                    Tú
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] text-muted-foreground">{u.email}</span>
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <span
                            className={`px-2.5 py-1 text-[10px] font-bold rounded-lg border ${
                              u.role === 'ADMIN'
                                ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                : u.role === 'OPERATOR'
                                ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                                : 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
                            }`}
                          >
                            {u.role === 'ADMIN' ? 'Administrador' : u.role === 'OPERATOR' ? 'Operador' : 'Auditor'}
                          </span>
                        </td>

                        <td className="py-3.5 px-4">
                          <button
                            onClick={() => handleToggleStatus(u)}
                            className={`flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-md transition-colors ${
                              u.isActive
                                ? 'text-emerald-400 hover:bg-emerald-500/10'
                                : 'text-zinc-400 hover:bg-zinc-500/10'
                            }`}
                            title="Haz clic para alternar activación"
                          >
                            <span className={`w-2 h-2 rounded-full ${u.isActive ? 'bg-emerald-400' : 'bg-zinc-500'}`} />
                            <span>{u.isActive ? 'Activo' : 'Inactivo'}</span>
                          </button>
                        </td>

                        <td className="py-3.5 px-4 text-muted-foreground text-[11px]">
                          {formatDate(u.lastLoginAt)}
                        </td>

                        <td className="py-3.5 px-4 text-muted-foreground text-[11px]">
                          {formatDate(u.createdAt)}
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleOpenEdit(u)}
                              className="p-1.5 rounded-lg border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                              title="Editar usuario"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleResetPassword(u)}
                              className="p-1.5 rounded-lg border border-border hover:bg-muted text-amber-400 hover:text-amber-300 transition-colors"
                              title="Restablecer contraseña de acceso"
                            >
                              <KeyRound className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteUser(u)}
                              disabled={isSelf}
                              className={`p-1.5 rounded-lg border border-border transition-colors ${
                                isSelf
                                  ? 'opacity-30 cursor-not-allowed text-muted-foreground'
                                  : 'hover:bg-rose-500/10 text-rose-400 hover:text-rose-300'
                              }`}
                              title={isSelf ? 'No puedes eliminar tu propia cuenta' : 'Eliminar usuario'}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Vista Móvil (Cards adaptadas para iPhone / pantallas pequeñas) */}
            <div className="block md:hidden divide-y divide-border">
              {users.map((u) => {
                const isSelf = currentUser?.id === u.id;
                return (
                  <div key={u.id} className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary font-bold flex items-center justify-center text-xs">
                          {u.fullName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-foreground">{u.fullName}</span>
                            {isSelf && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-primary/20 text-primary">
                                Tú
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-muted-foreground">{u.email}</span>
                        </div>
                      </div>

                      <span
                        className={`px-2 py-0.5 text-[9px] font-bold rounded-md border ${
                          u.role === 'ADMIN'
                            ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                            : u.role === 'OPERATOR'
                            ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                            : 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
                        }`}
                      >
                        {u.role}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
                      <div className="flex items-center gap-1">
                        <span className={`w-2 h-2 rounded-full ${u.isActive ? 'bg-emerald-400' : 'bg-zinc-500'}`} />
                        <span>{u.isActive ? 'Activo' : 'Inactivo'}</span>
                      </div>
                      <div className="flex items-center gap-1 text-[10px]">
                        <Clock className="w-3 h-3" />
                        <span>Acceso: {formatDate(u.lastLoginAt)}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/50">
                      <button
                        onClick={() => handleToggleStatus(u)}
                        className="px-2.5 py-1 rounded-lg border border-border text-[11px] font-medium text-muted-foreground hover:bg-muted"
                      >
                        {u.isActive ? 'Desactivar' : 'Activar'}
                      </button>
                      <button
                        onClick={() => handleOpenEdit(u)}
                        className="px-2.5 py-1 rounded-lg border border-border text-[11px] font-medium text-foreground hover:bg-muted"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleResetPassword(u)}
                        className="px-2.5 py-1 rounded-lg border border-border text-[11px] font-medium text-amber-400 hover:bg-muted"
                      >
                        Clave
                      </button>
                      {!isSelf && (
                        <button
                          onClick={() => handleDeleteUser(u)}
                          className="px-2.5 py-1 rounded-lg border border-border text-[11px] font-medium text-rose-400 hover:bg-rose-500/10"
                        >
                          Eliminar
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Paginación */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-border flex items-center justify-between">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 rounded-xl border border-border text-xs text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
            >
              Anterior
            </button>
            <span className="text-xs text-muted-foreground">
              Página {page} de {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 rounded-xl border border-border text-xs text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
            >
              Siguiente
            </button>
          </div>
        )}
      </div>

      {/* Modal: Crear Usuario */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-xl overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between bg-muted/30">
              <div className="flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-primary" />
                <h3 className="text-sm font-bold text-foreground">Crear Nuevo Usuario</h3>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Nombre Completo *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Laura Gómez"
                  value={createForm.fullName}
                  onChange={(e) => setCreateForm({ ...createForm, fullName: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-muted/40 border border-border text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Correo Electrónico *</label>
                <input
                  type="email"
                  required
                  placeholder="laura@eventgrid.io"
                  value={createForm.email}
                  onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-muted/40 border border-border text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Rol en la Plataforma *</label>
                <select
                  value={createForm.role}
                  onChange={(e) => setCreateForm({ ...createForm, role: e.target.value as any })}
                  className="w-full px-3 py-2 rounded-xl bg-muted/40 border border-border text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary cursor-pointer font-medium"
                >
                  <option value="OPERATOR">Operador (Check-in, Entregas y Registro)</option>
                  <option value="ADMIN">Administrador Completo</option>
                  <option value="VIEWER">Auditor (Consulta y Reportes)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">
                  Contraseña Inicial (Opcional)
                </label>
                <input
                  type="password"
                  placeholder="Dejar en blanco para generar clave temporal segura"
                  value={createForm.password}
                  onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-muted/40 border border-border text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Si se omite, el sistema generará una contraseña temporal aleatoria de un solo uso.
                </p>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-border text-xs text-muted-foreground hover:bg-muted font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold shadow-md disabled:opacity-50"
                >
                  {submitting ? 'Creando...' : 'Crear Usuario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Editar Usuario */}
      {isEditModalOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-xl overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between bg-muted/30">
              <div className="flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-primary" />
                <h3 className="text-sm font-bold text-foreground">Editar Usuario: {selectedUser.email}</h3>
              </div>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateUser} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Nombre Completo *</label>
                <input
                  type="text"
                  required
                  value={editForm.fullName}
                  onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-muted/40 border border-border text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Rol RBAC *</label>
                <select
                  value={editForm.role}
                  onChange={(e) => setEditForm({ ...editForm, role: e.target.value as any })}
                  className="w-full px-3 py-2 rounded-xl bg-muted/40 border border-border text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary cursor-pointer font-medium"
                >
                  <option value="OPERATOR">Operador</option>
                  <option value="ADMIN">Administrador</option>
                  <option value="VIEWER">Auditor (Consulta)</option>
                </select>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-muted/30 border border-border">
                <div>
                  <span className="text-xs font-semibold text-foreground block">Estado de la Cuenta</span>
                  <span className="text-[10px] text-muted-foreground">Permite o bloquea el inicio de sesión</span>
                </div>
                <button
                  type="button"
                  onClick={() => setEditForm({ ...editForm, isActive: !editForm.isActive })}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                    editForm.isActive
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-zinc-500/20 text-zinc-400 border border-zinc-500/30'
                  }`}
                >
                  {editForm.isActive ? 'Activo' : 'Inactivo'}
                </button>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-border text-xs text-muted-foreground hover:bg-muted font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold shadow-md disabled:opacity-50"
                >
                  {submitting ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Contraseña Temporal Generada */}
      {isResetModalOpen && resetResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-xl overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between bg-muted/30">
              <div className="flex items-center gap-2">
                <Lock className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-bold text-foreground">Credencial Temporal Generada</h3>
              </div>
              <button
                onClick={() => {
                  setIsResetModalOpen(false);
                  setResetResult(null);
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-xs text-muted-foreground">{resetResult.message}</p>

              {resetResult.temporaryPassword && (
                <div className="p-4 rounded-xl bg-muted/60 border border-border space-y-2">
                  <span className="text-[10px] font-bold uppercase text-muted-foreground block">
                    Contraseña Temporal (Un solo uso)
                  </span>
                  <div className="flex items-center justify-between gap-2 bg-card border border-border rounded-lg p-2.5">
                    <code className="text-xs font-mono font-bold text-primary select-all">
                      {resetResult.temporaryPassword}
                    </code>
                    <button
                      onClick={() => copyToClipboard(resetResult.temporaryPassword!)}
                      className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 text-xs"
                      title="Copiar contraseña"
                    >
                      {copiedPass ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span className="text-[10px]">{copiedPass ? 'Copiado' : 'Copiar'}</span>
                    </button>
                  </div>
                  <p className="text-[10px] text-amber-400 flex items-center gap-1 mt-1">
                    <AlertTriangle className="w-3 h-3 shrink-0" />
                    Entrega esta clave al usuario de forma segura. Se le solicitará cambiarla en su próximo acceso.
                  </p>
                </div>
              )}

              <div className="pt-2 flex justify-end border-t border-border">
                <button
                  type="button"
                  onClick={() => {
                    setIsResetModalOpen(false);
                    setResetResult(null);
                  }}
                  className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold shadow-md"
                >
                  Entendido y Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
