import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
export function PersonnelNavigation() {
  const { hasRole } = useAuth();
  return <nav aria-label="Personal y accesos" className="flex flex-wrap items-center gap-3 text-sm border-b border-border pb-3">
    <span className="font-bold">Personal y accesos</span>
    {[['/staff', 'Colaboradores'], ...(hasRole(['ADMIN']) ? [['/users', 'Usuarios']] : [])].map(([to, label]) => <NavLink key={to} to={to} className={({ isActive }) => 'px-3 py-2 rounded-xl ' + (isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>{label}</NavLink>)}
  </nav>;
}
