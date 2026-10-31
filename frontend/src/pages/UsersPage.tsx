import {OperatorPermissions} from '../components/common/OperatorPermissions';
import { PersonnelNavigation } from '../components/common/PersonnelNavigation';
import { Link,useSearchParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useRealtimeRefresh } from '../context/RealtimeContext';
import { UserInvitationModal, InvitationHistory } from '../components/common/UserInvitationModal';
import { invitationLabel } from '../utils/invitationStatus';
import { PersonnelInvitations } from '../components/common/PersonnelInvitations';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  UserCog,
  Shield,
  Plus,
  Search,
  Filter,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Clock,
  Mail,
  UserCheck,
  UserX,
  X,
} from 'lucide-react';
import { useEdition } from '../context/EditionContext';
import { useAuth } from '../context/AuthContext';
import { usersService, UserItem } from '../services/users.service';

export const UsersPage: React.FC = () => {
  const { events, currentEvent, switchEdition } = useEdition();
  const { user: currentUser } = useAuth();

  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filtros
  const [search, setSearch] = useState('');
  const [editUsername,setEditUsername]=useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Modales
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserItem | null>(null);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [invitationIds, setInvitationIds] = useState<string[] | null>(null);
  const [historyUser, setHistoryUser] = useState<UserItem | null>(null);
  const formLock = useRef(false);
  const fetchVersion = useRef(0);

  // Formulario de creación
  const [createForm, setCreateForm] = useState({
    email: '',
    scannerOnly: false,
    fullName: '',
    role: 'OPERATOR' as 'ADMIN' | 'OPERATOR' | 'VIEWER',
  });

  // Formulario de edición
  const [editForm, setEditForm] = useState({
    scannerOnly: false,
    fullName: '',
    role: 'OPERATOR' as 'ADMIN' | 'OPERATOR' | 'VIEWER',
    isActive: true,
    staffArea: '',
    assignedEventId: '',
  });

  const [submitting, setSubmitting] = useState(false);
  const [createSurname,setCreateSurname]=useState('');
  const [createPermissions,setCreatePermissions]=useState<string[]|undefined>(),[editPermissions,setEditPermissions]=useState<string[]|undefined>();
  const [query,setQuery]=useSearchParams();

  const fetchUsers = useCallback(async (silent = false) => {
    const version = ++fetchVersion.current;
    try {
      if (!silent) setLoading(true);
      if (!silent) setError(null);

      const params: any = { page, limit: 15 };
      if (search.trim()) params.search = search.trim();
      if (roleFilter !== 'ALL') params.role = roleFilter;
      if (statusFilter === 'ACTIVE') params.isActive = true;
      if (statusFilter === 'INACTIVE') params.isActive = false;

      const res = await usersService.listUsers(params);
      if (version !== fetchVersion.current) return;
      setUsers(res.users);
      setTotalPages(res.pagination.totalPages);
      setTotalCount(res.pagination.total);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Error al cargar listado de usuarios');
    } finally {
      if (version === fetchVersion.current) setLoading(false);
    }
  }, [page, search, roleFilter, statusFilter, currentEvent?.id]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => { setSelectedIds([]); setInvitationIds(null); setIsCreateModalOpen(false); setIsEditModalOpen(false); }, [page, search, roleFilter, statusFilter, currentEvent?.id]);
  const toggleSelection = (id: string) => setSelectedIds(ids => ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id]);
  const allVisibleSelected = users.length > 0 && users.every(user => selectedIds.includes(user.id));

  useRealtimeRefresh('users', () => fetchUsers(true));
  useEffect(()=>{if(query.get('create')==='1'){setIsCreateModalOpen(true);const next=new URLSearchParams(query);next.delete('create');setQuery(next,{replace:true});}},[query]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formLock.current) return; formLock.current = true;
    try {
      setSubmitting(true);
      setError(null);

      const res = await usersService.createUser({
        email: createForm.email.trim(),
        inviteNow:true,invitationRequestKey:crypto.randomUUID(),
        fullName: [createForm.fullName.trim(),createSurname.trim()].filter(Boolean).join(' '),
        operationalPermissions:createPermissions,
        role: createForm.role,
        scannerOnly: createForm.scannerOnly,
        ...(createForm.scannerOnly ? {assignedEventId: currentEvent?.id} : {}),
      });

      setIsCreateModalOpen(false);
      setCreateForm({ email: '', fullName: '', role: 'OPERATOR', scannerOnly: false });setCreateSurname('');setCreatePermissions(undefined);

      setSuccessMsg(`Cuenta de ${res.user.fullName} creada, pendiente de activación. ${res.user.creationInvitation?.results?.[0]?.status==='ACCEPTED_BY_PROVIDER'?'Invitación aceptada por el proveedor; entrega no confirmada.':res.user.creationInvitation?.results?.[0]?.reason||'Invitación pendiente de envío.'}`);
      setTimeout(() => setSuccessMsg(null), 5000);

      fetchUsers();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Error al crear usuario.');
    } finally {
      formLock.current = false;
      setSubmitting(false);
    }
  };

  const handleOpenEdit = (u: UserItem) => {
    setSelectedUser(u);
    try{setEditPermissions(u.operationalPermissions==null?undefined:JSON.parse(u.operationalPermissions));}catch{setEditPermissions([]);}
    setEditUsername(u.username||'');
    setEditForm({
      fullName: u.fullName,
      scannerOnly: Boolean(u.scannerOnly),
      role: u.role,
      isActive: u.accountStatus === 'PENDING' ? false : u.isActive,
      staffArea: u.staffArea || '',
      assignedEventId: u.assignedEventId || '',
    });
    setIsEditModalOpen(true);
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || formLock.current) return;
    formLock.current = true;
    try {
      setSubmitting(true);
      setError(null);

      const updated = await usersService.updateUser(selectedUser.id, { ...editForm,...(editUsername.trim()?{username:editUsername.trim()}:{}), operationalPermissions:editPermissions, assignedEventId: editForm.assignedEventId || null });
      setIsEditModalOpen(false);
      setSelectedUser(null);
      setSuccessMsg(`Usuario ${updated.fullName} actualizado correctamente.`);
      setTimeout(() => setSuccessMsg(null), 4000);
      fetchUsers();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Error al actualizar usuario.');
    } finally {
      formLock.current = false;
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

  const handlePrepareInvitation = (u: UserItem) => setInvitationIds([u.id]);

  const handleDeleteUser = async (u: UserItem) => {
    if (!window.confirm(`¿Estás seguro de que deseas desactivar la cuenta de ${u.fullName} (${u.email})?`)) {
      return;
    }
    try {
      setError(null);
      const res = await usersService.deleteUser(u.id);
      setSuccessMsg(res.message);
      setTimeout(() => setSuccessMsg(null), 4000);
      fetchUsers();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Error al desactivar usuario.');
    }
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
      <PersonnelNavigation />
      <PersonnelInvitations users={users} onSaved={fetchUsers} />
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
              <option value="VIEWER">Solo consulta</option>
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

      <div className="flex flex-wrap items-center gap-3 text-xs">
        <label className="flex items-center gap-2 py-2"><input type="checkbox" className="w-5 h-5 accent-primary" disabled={loading || Boolean(invitationIds) || !users.length} checked={allVisibleSelected} onChange={() => setSelectedIds(allVisibleSelected ? [] : users.map(user => user.id))} />Seleccionar todos los usuarios de esta página ({users.length})</label>
        <span>{selectedIds.length} seleccionados</span>
        <button disabled={!selectedIds.length || loading || Boolean(invitationIds)} className="px-4 py-2 rounded-full bg-primary text-primary-foreground disabled:opacity-50" onClick={() => setInvitationIds([...selectedIds])}>Enviar invitaciones ({selectedIds.length})</button>
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
                    <th className="py-3 px-2"><span className="sr-only">Selección</span></th>
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
                        <td className="px-2"><input aria-label={`Seleccionar ${u.fullName}`} className="w-5 h-5 accent-primary" type="checkbox" disabled={Boolean(invitationIds)} checked={selectedIds.includes(u.id)} onChange={() => toggleSelection(u.id)} /></td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary font-bold flex items-center justify-center text-xs shrink-0">
                              {u.fullName.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-foreground">{u.fullName}</span>{u.staffMembers?.map(member => <Link key={member.id} to="/staff" onClick={() => { if (member.eventId !== currentEvent?.id) switchEdition(member.eventId); }} className="block text-xs text-primary">Colaborador: {member.firstName} {member.lastName}</Link>)}
                                {isSelf && (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-primary/20 text-primary">
                                    Tú
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] text-muted-foreground break-all">{u.email}</span><p className="text-[10px] text-muted-foreground">{invitationLabel(u.invitationState)}</p>
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
                            {u.scannerOnly?'Escáner QR':u.role === 'ADMIN' ? 'Administrador' : u.role === 'OPERATOR' ? 'Operador' : 'Consulta'}
                          </span>
                        </td>

                        <td className="py-3.5 px-4">
                          <button
                            onClick={() => handleToggleStatus(u)}
                            disabled={Boolean(invitationIds) || u.accountStatus === 'PENDING'}
                            className={`flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-md transition-colors ${
                              u.isActive
                                ? 'text-emerald-400 hover:bg-emerald-500/10'
                                : 'text-zinc-400 hover:bg-zinc-500/10'
                            }`}
                            title="Haz clic para alternar activación"
                          >
                            <span className={`w-2 h-2 rounded-full ${u.isActive ? 'bg-emerald-400' : 'bg-zinc-500'}`} />
                            <span>{u.accountStatus === 'PENDING' ? 'Pendiente de activación' : u.isActive ? 'Activo' : 'Inactivo'}</span>
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
                              disabled={Boolean(invitationIds)} onClick={() => handleOpenEdit(u)}
                              className="p-1.5 rounded-lg border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                              title="Editar usuario"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handlePrepareInvitation(u)}
                              className="p-1.5 rounded-lg border border-border hover:bg-muted text-amber-400 hover:text-amber-300 transition-colors"
                              title="Preparar invitación de acceso"
                            >
                              <Mail className="w-3.5 h-3.5" />
                            </button><button title="Historial de invitaciones" onClick={() => setHistoryUser(u)} className="p-1.5 rounded-lg border border-border"><Clock className="w-3.5 h-3.5" /></button>
                            <button
                              onClick={() => handleDeleteUser(u)}
                              disabled={isSelf || !u.isActive || Boolean(invitationIds)}
                              className={`p-1.5 rounded-lg border border-border transition-colors ${
                                isSelf
                                  ? 'opacity-30 cursor-not-allowed text-muted-foreground'
                                  : 'hover:bg-rose-500/10 text-rose-400 hover:text-rose-300'
                              }`}
                              title={isSelf ? 'No puedes desactivar tu propia cuenta' : 'Desactivar usuario'}
                            >
                              <XCircle className="w-3.5 h-3.5" />
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
                    <label className="flex items-center gap-2 text-xs"><input aria-label={`Seleccionar ${u.fullName}`} className="w-5 h-5 accent-primary" type="checkbox" disabled={Boolean(invitationIds)} checked={selectedIds.includes(u.id)} onChange={() => toggleSelection(u.id)} />Seleccionar</label>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary font-bold flex items-center justify-center text-xs">
                          {u.fullName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                            <span className="text-xs font-bold text-foreground break-words">{u.fullName}</span>{u.staffMembers?.map(member => <Link key={member.id} to="/staff" onClick={() => { if (member.eventId !== currentEvent?.id) switchEdition(member.eventId); }} className="block text-xs text-primary">Colaborador: {member.firstName} {member.lastName}</Link>)}
                            {isSelf && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-primary/20 text-primary">
                                Tú
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-muted-foreground break-all">{u.email}</span><p className="text-[10px] text-muted-foreground">{invitationLabel(u.invitationState)}</p>
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
                        {u.scannerOnly?'Escáner QR':u.role}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
                      <div className="flex items-center gap-1">
                        <span className={`w-2 h-2 rounded-full ${u.isActive ? 'bg-emerald-400' : 'bg-zinc-500'}`} />
                        <span>{u.accountStatus === 'PENDING' ? 'Pendiente de activación' : u.isActive ? 'Activo' : 'Inactivo'}</span>
                      </div>
                      <div className="flex items-center gap-1 text-[10px]">
                        <Clock className="w-3 h-3" />
                        <span>Acceso: {formatDate(u.lastLoginAt)}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/50">
                      <button
                        onClick={() => handleToggleStatus(u)}
                            disabled={Boolean(invitationIds) || u.accountStatus === 'PENDING'}
                        className="px-2.5 py-1 rounded-lg border border-border text-[11px] font-medium text-muted-foreground hover:bg-muted"
                      >
                        {u.isActive ? 'Desactivar' : 'Activar'}
                      </button>
                      <button
                        disabled={Boolean(invitationIds)} onClick={() => handleOpenEdit(u)}
                        className="px-2.5 py-1 rounded-lg border border-border text-[11px] font-medium text-foreground hover:bg-muted"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handlePrepareInvitation(u)}
                        className="px-2.5 py-1 rounded-lg border border-border text-[11px] font-medium text-amber-400 hover:bg-muted"
                      >
                        Invitar
                      </button>
                      <button onClick={() => setHistoryUser(u)} className="px-2.5 py-1 rounded-lg border border-border text-[11px]">Historial</button>

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
      {isCreateModalOpen && createPortal((
        <div className="mobile-safe-overlay fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div role="dialog" aria-modal="true" aria-label={isCreateModalOpen ? 'Crear usuario' : 'Editar usuario'} className="mobile-form-dialog w-full max-w-2xl max-h-[90dvh] overflow-y-auto bg-card border border-border rounded-2xl shadow-xl">
            <div className="p-4 border-b border-border flex items-center justify-between bg-muted/30">
              <div className="flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-primary" />
                <h3 className="text-sm font-bold text-foreground">Invitar usuario</h3>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="mobile-form-body p-5 space-y-4">
              {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Nombre *</label>
                <input
                  aria-label="Nombre" type="text"
                  required minLength={2}
                  placeholder="Ej. Laura"
                  value={createForm.fullName}
                  onChange={(e) => setCreateForm({ ...createForm, fullName: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-muted/40 border border-border text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                />
              </div>

              <label className="block text-sm">Apellido *<input required minLength={2} className="input-field w-full mt-1" value={createSurname} onChange={e=>setCreateSurname(e.target.value)}/></label>
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Correo Electrónico *</label>
                <input
                  aria-label="Correo electrónico" type="email"
                  required
                  placeholder="laura@eventgrid.io"
                  value={createForm.email}
                  onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-muted/40 border border-border text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Tipo de cuenta *</label>
                <select aria-label="Rol"
                  value={createForm.role}
                  onChange={(e) => setCreateForm({ ...createForm, role:e.target.value as any,scannerOnly:false })}
                  className="w-full px-3 py-2 rounded-xl bg-muted/40 border border-border text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary cursor-pointer font-medium"
                >
                  <option value="OPERATOR">Personal operativo</option>
                  <option value="ADMIN">Administrador</option>
                  <option value="VIEWER">Solo consulta</option>
                </select>
              </div>
<label className="flex gap-2 text-sm border border-border rounded-xl p-3"><input type="checkbox" disabled={createForm.role!=='OPERATOR'} checked={createForm.scannerOnly} onChange={e=>setCreateForm({...createForm,scannerOnly:e.target.checked})}/>Acceso especial: Escáner QR (sin cobros, entregas ni administración)</label>
{createForm.role==='OPERATOR'&&!createForm.scannerOnly&&<OperatorPermissions value={createPermissions} onChange={setCreatePermissions} disabled={submitting}/>}
              <section className="border border-border rounded-xl p-3 text-sm space-y-1"><h3 className="font-semibold">Edición y acceso</h3><p>Edición: {currentEvent?.name||'Selecciona una edición'}</p><p className="text-xs text-muted-foreground">La cuenta se crea pendiente de activación. La persona elegirá su nombre de usuario y establecerá su contraseña mediante el flujo seguro existente. Crear e invitar autoriza un envío individual. Si falta SMTP o el dominio público, la invitación queda pendiente para reintentar.</p></section>
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
                  {submitting ? 'Creando...' : 'Crear y enviar invitación'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ), document.body)}

      {/* Modal: Editar Usuario */}
      {isEditModalOpen && selectedUser && createPortal((
        <div className="mobile-safe-overlay fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div role="dialog" aria-modal="true" aria-label={isCreateModalOpen ? 'Crear usuario' : 'Editar usuario'} className="mobile-form-dialog w-full max-w-2xl max-h-[90dvh] overflow-y-auto bg-card border border-border rounded-2xl shadow-xl">
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

            <form onSubmit={handleUpdateUser} className="mobile-form-body p-5 space-y-4">
              <label className="block text-sm">Nombre de usuario<input aria-label="Nombre de usuario" minLength={3} maxLength={32} pattern="[a-zA-Z0-9][a-zA-Z0-9._-]{2,31}" value={editUsername} onChange={e=>setEditUsername(e.target.value)} className="input-field w-full"/></label>
              {editForm.role==='OPERATOR'&&!editForm.scannerOnly&&<OperatorPermissions value={editPermissions} onChange={setEditPermissions} legacy={selectedUser?.operationalPermissions==null} disabled={submitting}/>}

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
                <label className="block text-xs font-semibold text-foreground mb-1">Tipo de cuenta *</label>
                <select
                  value={editForm.role}
                  onChange={(e) => setEditForm({ ...editForm, role: e.target.value as any, scannerOnly: false })}
                  className="w-full px-3 py-2 rounded-xl bg-muted/40 border border-border text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary cursor-pointer font-medium"
                >
                  <option value="OPERATOR">Personal operativo</option>
                  <option value="ADMIN">Administrador</option>
                  <option value="VIEWER">Auditor (Consulta)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Edición asignada (Operador / Consulta)</label>
                <select disabled={Boolean(currentUser?.assignedEventId)} aria-label="Edición asignada" value={editForm.assignedEventId} onChange={e => setEditForm({ ...editForm, assignedEventId: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-muted/40 border border-border text-xs text-foreground">
                  <option value="">Edición predeterminada</option>
                  {events.map(event => <option key={event.id} value={event.id}>{event.name} · {event.year}</option>)}
                </select>
              </div>
              <label className="flex items-center gap-3 rounded-xl border border-border p-3 text-sm"><input type="checkbox" disabled={editForm.role!=='OPERATOR'} checked={editForm.scannerOnly} onChange={e=>setEditForm({...editForm,scannerOnly:e.target.checked,assignedEventId:editForm.assignedEventId||currentEvent?.id||''})}/>Acceso especial: Escáner QR (restringido)</label>
              <label className="block text-xs">Área del staff (opcional)<input value={editForm.staffArea} onChange={e => setEditForm({ ...editForm, staffArea: e.target.value })} className="mt-1 w-full p-2 rounded-xl bg-background border border-border" /></label>

              <div className="flex items-center justify-between p-3 rounded-xl bg-muted/30 border border-border">
                <div>
                  <span className="text-xs font-semibold text-foreground block">Estado de la Cuenta</span>
                  <span className="text-[10px] text-muted-foreground">Permite o bloquea el inicio de sesión</span>
                </div>
                <button
                  type="button"
                  disabled={selectedUser?.accountStatus === 'PENDING'} onClick={() => setEditForm({ ...editForm, isActive: !editForm.isActive })}
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
      ), document.body)}

      {invitationIds && <UserInvitationModal ids={invitationIds} onClose={() => setInvitationIds(null)} onSaved={fetchUsers} />}
      {historyUser && <InvitationHistory user={historyUser} onClose={() => setHistoryUser(null)} />}
    </div>
  );
};
