import React from 'react'
import { Customer } from '../../types'
import { Mail, Phone, Building2, Calendar, Edit2, Trash2, User } from 'lucide-react'

interface CustomerCardProps {
  customer: Customer;
  onEdit: (customer: Customer) => void;
  onDelete: (customer: Customer) => void;
  onSelect: (customer: Customer) => void;
}

export const CustomerCard: React.FC<CustomerCardProps> = ({
  customer,
  onEdit,
  onDelete,
  onSelect
}) => {
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  // Generate name initials for avatar
  const initials = customer.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div 
      role="button"
      tabIndex={0}
      onClick={() => onSelect(customer)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect(customer)
        }
      }}
      aria-label={`Open workspace for ${customer.name}`}
      className="bg-[#FFFDF9] p-5 rounded-2xl border border-[#E8E1D8] hover:border-[#B85C38]/40 hover:shadow-md transition-all duration-200 flex flex-col justify-between h-full group relative overflow-hidden cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#B85C38]/20"
    >
      <div className="space-y-4 relative z-10">
        {/* Header: Avatar + Name / Company */}
        <div className="flex items-start gap-3">
          {/* Avatar Icon */}
          <div className="w-10 h-10 rounded-xl bg-[#F0D8CA]/60 text-[#B85C38] border border-[#B85C38]/20 flex items-center justify-center font-bold text-sm select-none shrink-0 shadow-xs">
            {initials || <User className="w-4 h-4" />}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-[#292522] leading-tight truncate group-hover:text-[#B85C38] transition-colors font-display" title={customer.name}>
              {customer.name}
            </h3>
            {customer.company ? (
              <div className="flex items-center gap-1 mt-1 text-xs text-[#817A72] truncate">
                <Building2 className="w-3.5 h-3.5 text-[#817A72] shrink-0" />
                <span className="truncate">{customer.company}</span>
              </div>
            ) : (
              <div className="text-[11px] italic text-[#817A72]/70 mt-1">No Company linked</div>
            )}
          </div>
        </div>

        {/* Contact Info (Email + Phone) */}
        <div className="space-y-2 text-xs text-[#817A72] border-t border-[#E8E1D8]/80 pt-3">
          {customer.email ? (
            <div className="flex items-center gap-2 truncate">
              <Mail className="w-3.5 h-3.5 text-[#817A72] shrink-0" />
              <span className="truncate" title={customer.email}>
                {customer.email}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-[#817A72]/60 italic">
              <Mail className="w-3.5 h-3.5 text-[#817A72]/50 shrink-0" />
              <span>No email provided</span>
            </div>
          )}

          {customer.phone ? (
            <div className="flex items-center gap-2 truncate">
              <Phone className="w-3.5 h-3.5 text-[#817A72] shrink-0" />
              <span className="truncate">{customer.phone}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-[#817A72]/60 italic">
              <Phone className="w-3.5 h-3.5 text-[#817A72]/50 shrink-0" />
              <span>No phone number</span>
            </div>
          )}
        </div>

        {/* Metadata: Created At */}
        <div className="flex items-center gap-1.5 text-[11px] text-[#817A72]">
          <Calendar className="w-3.5 h-3.5 text-[#817A72]/70" />
          <span>Added: {formatDate(customer.created_at)}</span>
        </div>
      </div>

      {/* Footer: Tags & Actions Row */}
      <div className="flex items-center justify-between mt-4 border-t border-[#E8E1D8]/80 pt-3 relative z-10">
        {/* Tags */}
        <div className="flex flex-wrap gap-1 max-w-[70%]">
          {customer.tags && customer.tags.length > 0 ? (
            customer.tags.slice(0, 2).map((tag, index) => (
              <span 
                key={index}
                className="bg-[#F0D8CA]/60 text-[#B85C38] border border-[#B85C38]/15 text-[10px] font-semibold px-2 py-0.5 rounded-md"
              >
                {tag}
              </span>
            ))
          ) : (
            <span className="text-[11px] text-[#817A72]/60 italic">No tags</span>
          )}
          {customer.tags && customer.tags.length > 2 && (
            <span className="bg-[#F7F4EE] text-[#817A72] text-[10px] font-semibold px-1.5 py-0.5 rounded-md border border-[#E8E1D8]">
              +{customer.tags.length - 2}
            </span>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1">
          {/* Edit */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(customer);
            }}
            aria-label={`Edit ${customer.name}`}
            className="p-1.5 text-[#817A72] hover:text-[#292522] hover:bg-[#F0D8CA]/40 rounded-lg transition-colors"
            title="Edit Customer"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          {/* Delete */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(customer);
            }}
            aria-label={`Delete ${customer.name}`}
            className="p-1.5 text-[#817A72] hover:text-[#B94A48] hover:bg-[#B94A48]/10 rounded-lg transition-colors"
            title="Delete Customer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
