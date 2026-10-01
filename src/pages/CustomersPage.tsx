import React, { useState } from 'react'
import { useCustomers } from '../hooks/useCustomers'
import { CustomerSearch } from '../components/customers/CustomerSearch'
import { CustomerList } from '../components/customers/CustomerList'
import { CustomerFormModal } from '../components/customers/CustomerFormModal'
import { DeleteCustomerDialog } from '../components/customers/DeleteCustomerDialog'
import { CustomerWorkspacePage } from './CustomerWorkspacePage'
import { Plus, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react'
import { Customer } from '../types'

export const CustomersPage: React.FC = () => {
  const {
    customers,
    loading,
    error,
    page,
    setPage,
    search,
    setSearch,
    sortOrder,
    setSortOrder,
    totalCount,
    hasNextPage,
    addCustomer,
    editCustomer,
    removeCustomer,
  } = useCustomers()

  // Modal Open & Selection states
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [selectedCustomerForWorkspace, setSelectedCustomerForWorkspace] = useState<Customer | null>(null)

  const handleAddClick = () => {
    setSelectedCustomer(null)
    setIsFormOpen(true)
  }

  const handleEditClick = (cust: Customer) => {
    setSelectedCustomer(cust)
    setIsFormOpen(true)
  }

  const handleDeleteClick = (cust: Customer) => {
    setSelectedCustomer(cust)
    setIsDeleteOpen(true)
  }

  const handleFormSubmit = async (data: Omit<Customer, 'id' | 'created_at' | 'owner_id'>) => {
    if (selectedCustomer) {
      await editCustomer(selectedCustomer.id, data)
    } else {
      await addCustomer(data)
    }
  }

  const handleDeleteConfirm = async () => {
    if (selectedCustomer) {
      await removeCustomer(selectedCustomer.id)
    }
  }

  const totalPages = Math.ceil(totalCount / 20) || 1

  if (selectedCustomerForWorkspace) {
    return (
      <CustomerWorkspacePage
        customer={selectedCustomerForWorkspace}
        onBack={() => setSelectedCustomerForWorkspace(null)}
      />
    )
  }

  return (
    <div className="space-y-6 flex flex-col h-full">
      {/* 1. Page Header */}
      <div className="flex justify-between items-center select-none shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#292522] font-display">Customers</h1>
          <p className="text-xs text-[#817A72] mt-0.5">Manage and track your customer directory and relationship activity</p>
        </div>
        <button
          onClick={handleAddClick}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#B85C38] hover:bg-[#a24f2f] text-white rounded-xl text-xs font-semibold transition active:scale-95 shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>Add Customer</span>
        </button>
      </div>

      {/* 2. Error Display Panel */}
      {error && (
        <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-[#B94A48]/10 border border-[#B94A48]/20 text-[#B94A48] text-xs shrink-0 animate-fadeIn">
          <AlertCircle className="w-4 h-4 text-[#B94A48] shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* 3. Search and Sort Filter Control */}
      <div className="bg-[#FFFDF9] border border-[#E8E1D8] p-4 rounded-2xl shrink-0 shadow-xs">
        <CustomerSearch
          search={search}
          onSearchChange={setSearch}
          sortOrder={sortOrder}
          onSortOrderChange={setSortOrder}
        />
      </div>

      {/* 4. Customer Listing Grid */}
      <div className="flex-1 overflow-y-auto min-h-0 pt-2">
        <CustomerList
          customers={customers}
          loading={loading}
          onEdit={handleEditClick}
          onDelete={handleDeleteClick}
          onAddClick={handleAddClick}
          onSelect={setSelectedCustomerForWorkspace}
        />
      </div>

      {/* 5. Pagination Toolbar */}
      {totalCount > 0 && (
        <div className="flex items-center justify-between border-t border-[#E8E1D8] pt-4 px-1 select-none shrink-0">
          <div className="text-xs text-[#817A72]">
            Showing <span className="font-semibold text-[#292522]">{customers.length}</span> of{' '}
            <span className="font-semibold text-[#292522]">{totalCount}</span> customers
          </div>

          <div className="flex items-center gap-4">
            {/* Page index stats */}
            <span className="text-xs font-semibold text-[#817A72]">
              Page <span className="text-[#292522] font-bold">{page}</span> of{' '}
              <span className="text-[#292522] font-bold">{totalPages}</span>
            </span>

            {/* Pagination Action Controls */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1 || loading}
                className="p-2 bg-[#FFFDF9] border border-[#E8E1D8] hover:bg-[#F0D8CA]/40 rounded-xl text-[#817A72] hover:text-[#292522] transition disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
                title="Previous Page"
                aria-label="Previous Page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setPage(p => p + 1)}
                disabled={!hasNextPage || loading}
                className="p-2 bg-[#FFFDF9] border border-[#E8E1D8] hover:bg-[#F0D8CA]/40 rounded-xl text-[#817A72] hover:text-[#292522] transition disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
                title="Next Page"
                aria-label="Next Page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Shared Form Modal Overlay */}
      <CustomerFormModal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        onSubmit={handleFormSubmit}
        customer={selectedCustomer}
      />

      {/* Safe Delete Dialog Confirmation Overlay */}
      <DeleteCustomerDialog
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={handleDeleteConfirm}
        customer={selectedCustomer}
      />
    </div>
  )
}
