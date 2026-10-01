import React from 'react'
import { Customer, CallSummary } from '../../types'
import { CallInsights } from './CallInsights'
import { Mail, Phone, Building2, Calendar, Shield, Sparkles } from 'lucide-react'

type SummaryWithCall = CallSummary & { call?: { started_at?: string; customer_id?: string } }

interface OverviewTabProps {
  customer: Customer;
  summaries?: SummaryWithCall[];
  summariesLoading?: boolean;
  onUpdateSummary?: (id: string, updates: { summary_text?: string }) => Promise<void>;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  customer,
  summaries = [],
  summariesLoading = false,
  onUpdateSummary
}) => {
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const items = [
    { label: 'Email Address', value: customer.email, icon: Mail, type: 'email' },
    { label: 'Phone Number', value: customer.phone, icon: Phone, type: 'phone' },
    { label: 'Company / Brokerage', value: customer.company, icon: Building2, type: 'text' },
    { label: 'Profile Registered', value: formatDate(customer.created_at), icon: Calendar, type: 'text' },
  ];

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 select-none">
        {/* Left Columns: Metadata list */}
        <div className="lg:col-span-2 bg-[#FFFDF9] border border-[#E8E1D8] rounded-2xl p-6 space-y-5 shadow-xs">
          <h3 className="text-sm font-bold text-[#292522] uppercase tracking-wider font-display mb-2">Customer Profile</h3>
          
          <div className="divide-y divide-[#E8E1D8]/80">
            {items.map((item, idx) => {
              const Icon = item.icon
              return (
                <div key={idx} className="grid grid-cols-3 py-3.5 first:pt-0 last:pb-0 items-start">
                  <span className="text-xs font-semibold text-[#817A72] flex items-center gap-2 mt-0.5">
                    <Icon className="w-4 h-4 text-[#817A72]" />
                    <span>{item.label}</span>
                  </span>
                  
                  <span className="col-span-2 text-sm text-[#292522] break-all pl-2 font-medium">
                    {item.value ? (
                      item.type === 'email' ? (
                        <a href={`mailto:${item.value}`} className="text-[#B85C38] hover:underline font-semibold">
                          {item.value}
                        </a>
                      ) : (
                        item.value
                      )
                    ) : (
                      <span className="text-[#817A72]/60 italic text-xs">Not specified</span>
                    )}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Right Column: Tags & Info Card */}
        <div className="bg-[#FFFDF9] border border-[#E8E1D8] rounded-2xl p-6 flex flex-col justify-between space-y-6 shadow-xs">
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-[#292522] uppercase tracking-wider font-display flex items-center gap-2">
              <Shield className="w-4 h-4 text-[#817A72]" />
              <span>Assigned Tags</span>
            </h3>
            
            <div className="flex flex-wrap gap-1.5">
              {customer.tags && customer.tags.length > 0 ? (
                customer.tags.map((tag, idx) => (
                  <span 
                    key={idx} 
                    className="bg-[#F0D8CA]/60 text-[#B85C38] border border-[#B85C38]/20 text-[10px] font-bold px-2.5 py-1 rounded-md tracking-wide uppercase"
                  >
                    {tag}
                  </span>
                ))
              ) : (
                <span className="text-xs text-[#817A72]/70 italic">No tags assigned to this customer.</span>
              )}
            </div>
          </div>

          <div className="p-3.5 bg-[#F7F4EE] border border-[#E8E1D8] rounded-xl text-[11px] text-[#817A72] leading-relaxed font-sans mt-auto">
            Use the edit drawer on the Customers directory page to modify fields or tag classifications.
          </div>
        </div>
      </div>

      {/* AI Call Insights with manual correction */}
      <section className="bg-[#FFFDF9] border border-[#E8E1D8] rounded-2xl p-6 space-y-4 shadow-xs">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[#B85C38]" />
          <h3 className="text-sm font-bold text-[#292522] uppercase tracking-wider font-display">AI Call Insights</h3>
          <span className="text-xs text-[#817A72] font-normal normal-case">Correct the summary if the local AI model got it wrong.</span>
        </div>
        <CallInsights summaries={summaries} loading={summariesLoading} onUpdate={onUpdateSummary!} />
      </section>
    </div>
  )
}
