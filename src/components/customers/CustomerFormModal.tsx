import React, { useState, useEffect } from 'react'
import { Customer } from '../../types'
import { X, Mail, Phone, Building2, User, Tag, AlertCircle } from 'lucide-react'

interface CustomerFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: Omit<Customer, 'id' | 'created_at' | 'owner_id'>) => Promise<void>;
  customer?: Customer | null; // If provided, we are in Edit Mode
}

export const CustomerFormModal: React.FC<CustomerFormModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  customer
}) => {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [company, setCompany] = useState('')
  const [tagsString, setTagsString] = useState('')

  const [loading, setLoading] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)

  // Populate form fields on open or customer changes
  useEffect(() => {
    if (isOpen) {
      setValidationError(null)
      if (customer) {
        setName(customer.name)
        setEmail(customer.email || '')
        setPhone(customer.phone || '')
        setCompany(customer.company || '')
        setTagsString(customer.tags ? customer.tags.join(', ') : '')
      } else {
        setName('')
        setEmail('')
        setPhone('')
        setCompany('')
        setTagsString('')
      }
    }
  }, [customer, isOpen])

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setValidationError(null)

    // 1. Validate Name
    if (!name.trim()) {
      setValidationError('Customer name is required.')
      return
    }

    // 2. Validate Email format (only if provided)
    if (email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(email.trim())) {
        setValidationError('Please provide a valid email address.')
        return
      }
    }

    setLoading(true)

    // 3. Process Tags: split by commas, trim whitespaces, and filter empty strings
    const tagsArray = tagsString
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);

    try {
      await onSubmit({
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        company: company.trim() || undefined,
        tags: tagsArray,
      })
      onClose()
    } catch (err: any) {
      setValidationError(err?.message || 'Failed to save customer profiles.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 select-none animate-fadeIn">
      {/* Backdrop overlay */}
      <div className="absolute inset-0 bg-[#292522]/40 backdrop-blur-xs" onClick={onClose} aria-hidden="true" />

      {/* Modal Content container */}
      <div 
        className="bg-[#FFFDF9] border border-[#E8E1D8] rounded-2xl w-full max-w-lg shadow-xl relative z-10 overflow-hidden flex flex-col max-h-[90vh] animate-slideUp"
        role="dialog"
        aria-modal="true"
        aria-labelledby="customer-modal-title"
      >
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#E8E1D8] flex items-center justify-between shrink-0">
          <h2 id="customer-modal-title" className="text-xl font-bold text-[#292522] font-display">
            {customer ? 'Edit Customer' : 'Add New Customer'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 text-[#817A72] hover:text-[#292522] rounded-lg hover:bg-[#F7F4EE] transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleFormSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          
          {/* Error Message */}
          {validationError && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-[#B94A48]/10 border border-[#B94A48]/20 text-[#B94A48] text-xs animate-fadeIn">
              <AlertCircle className="w-4 h-4 text-[#B94A48] shrink-0 mt-0.5" />
              <span>{validationError}</span>
            </div>
          )}

          {/* Full Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#817A72] uppercase tracking-wider">
              Full Name <span className="text-[#B85C38]">*</span>
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#817A72]">
                <User className="w-4.5 h-4.5" />
              </span>
              <input
                type="text"
                required
                placeholder="Jane Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={loading}
                className="w-full pl-10 pr-4 py-2.5 bg-[#FFFDF9] border border-[#E8E1D8] focus:border-[#B85C38] focus:ring-2 focus:ring-[#B85C38]/15 focus:outline-none rounded-xl text-sm text-[#292522] placeholder-[#817A72]"
              />
            </div>
          </div>

          {/* Email Address */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#817A72] uppercase tracking-wider">Email Address</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#817A72]">
                <Mail className="w-4.5 h-4.5" />
              </span>
              <input
                type="email"
                placeholder="jane@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                className="w-full pl-10 pr-4 py-2.5 bg-[#FFFDF9] border border-[#E8E1D8] focus:border-[#B85C38] focus:ring-2 focus:ring-[#B85C38]/15 focus:outline-none rounded-xl text-sm text-[#292522] placeholder-[#817A72]"
              />
            </div>
          </div>

          {/* Phone Number */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#817A72] uppercase tracking-wider">Phone Number</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#817A72]">
                <Phone className="w-4.5 h-4.5" />
              </span>
              <input
                type="tel"
                placeholder="555-0199"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={loading}
                className="w-full pl-10 pr-4 py-2.5 bg-[#FFFDF9] border border-[#E8E1D8] focus:border-[#B85C38] focus:ring-2 focus:ring-[#B85C38]/15 focus:outline-none rounded-xl text-sm text-[#292522] placeholder-[#817A72]"
              />
            </div>
          </div>

          {/* Company / Brokerage */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#817A72] uppercase tracking-wider">Company / Brokerage</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#817A72]">
                <Building2 className="w-4.5 h-4.5" />
              </span>
              <input
                type="text"
                placeholder="e.g. Mitchell Family Trust"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                disabled={loading}
                className="w-full pl-10 pr-4 py-2.5 bg-[#FFFDF9] border border-[#E8E1D8] focus:border-[#B85C38] focus:ring-2 focus:ring-[#B85C38]/15 focus:outline-none rounded-xl text-sm text-[#292522] placeholder-[#817A72]"
              />
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#817A72] uppercase tracking-wider">
              Tags <span className="text-[10px] text-[#817A72]/70 lowercase">(comma separated)</span>
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#817A72]">
                <Tag className="w-4.5 h-4.5" />
              </span>
              <input
                type="text"
                placeholder="enterprise, high-priority, smb"
                value={tagsString}
                onChange={(e) => setTagsString(e.target.value)}
                disabled={loading}
                className="w-full pl-10 pr-4 py-2.5 bg-[#FFFDF9] border border-[#E8E1D8] focus:border-[#B85C38] focus:ring-2 focus:ring-[#B85C38]/15 focus:outline-none rounded-xl text-sm text-[#292522] placeholder-[#817A72]"
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-[#E8E1D8]">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-sm font-semibold text-[#817A72] hover:text-[#292522] border border-[#E8E1D8] bg-[#FFFDF9] hover:bg-[#F7F4EE] rounded-xl transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 bg-[#B85C38] hover:bg-[#a24f2f] text-white rounded-xl text-sm font-semibold shadow-xs transition flex items-center justify-center disabled:opacity-50"
            >
              {loading ? (
                <span className="border-2 border-white border-t-transparent w-4 h-4 rounded-full animate-spin" />
              ) : (
                customer ? 'Save Changes' : 'Create Customer'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
