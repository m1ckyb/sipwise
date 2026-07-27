import { useState, type FormEvent } from 'react';
import { useAppContext } from '../context/AppContext';
import { estimateCalories, type InventoryItem } from '../utils/bac';

function InventoryManager() {
  const { inventory, addInventoryItem, removeInventoryItem, updateInventoryItem, showToast } = useAppContext();
  
  const [isAdding, setIsAdding] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  
  const [name, setName] = useState('');
  const [type, setType] = useState<'container' | 'individual'>('container');
  const [unitVolume, setUnitVolume] = useState<number | ''>('');
  const [abv, setAbv] = useState<number | ''>('');
  const [quantity, setQuantity] = useState<number | ''>(1);
  const [calories, setCalories] = useState<number | ''>('');

  const resetForm = () => {
    setName('');
    setType('container');
    setUnitVolume('');
    setAbv('');
    setQuantity(1);
    setCalories('');
    setIsAdding(false);
    setEditingItemId(null);
  };

  const handleAddOrUpdate = (e: FormEvent) => {
    e.preventDefault();
    if (!name || !unitVolume || !abv || quantity === '') {
      showToast('Please fill in all required fields', 'error');
      return;
    }

    const calculatedCalories = calories !== '' ? Number(calories) : estimateCalories(Number(unitVolume), Number(abv));
    const itemData = {
      name,
      type,
      unitVolume: Number(unitVolume),
      abv: Number(abv),
      quantity: Number(quantity),
      calories: calculatedCalories,
    };

    if (editingItemId) {
      updateInventoryItem(editingItemId, itemData);
      showToast('Inventory item updated', 'success');
    } else {
      addInventoryItem(itemData);
      showToast('Inventory item added', 'success');
    }
    resetForm();
  };

  const startEdit = (item: InventoryItem) => {
    setEditingItemId(item.id);
    setName(item.name);
    setType(item.type);
    setUnitVolume(item.unitVolume);
    setAbv(item.abv);
    setQuantity(item.quantity);
    setCalories(item.calories !== undefined ? item.calories : '');
    setIsAdding(true);
  };

  const adjustQuantity = (id: string, delta: number) => {
    const item = inventory.find(i => i.id === id);
    if (!item) return;
    const newQty = Math.max(0, item.quantity + delta);
    updateInventoryItem(id, { quantity: newQty });
  };

  return (
    <div className="inventory-manager" style={{ paddingBottom: 'var(--spacing-xl)' }}>
      <div className="settings-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2>Stock & Inventory</h2>
          <p>Track your available drinks and automatically deduct what you consume.</p>
        </div>
        {!isAdding && (
          <button 
            type="button" 
            className="primary-btn" 
            onClick={() => { resetForm(); setIsAdding(true); }}
            style={{ padding: 'var(--spacing-sm) var(--spacing-md)', fontSize: '0.9rem' }}
          >
            + Add Stock
          </button>
        )}
      </div>

      {isAdding && (
        <form onSubmit={handleAddOrUpdate} className="card custom-form" style={{ marginTop: 'var(--spacing-md)' }}>
          <h3>{editingItemId ? 'Edit Stock Item' : 'Add New Stock Item'}</h3>
          
          <div className="form-group" style={{ marginTop: 'var(--spacing-sm)' }}>
            <label htmlFor="inv-name">Drink Name</label>
            <input 
              id="inv-name"
              type="text" 
              value={name} 
              onChange={e => setName(e.target.value)} 
              placeholder="e.g. Vodka Bottle, IPA Cans"
              required 
            />
          </div>

          <div className="form-group">
            <label htmlFor="inv-type">Stock Type</label>
            <div className="select-wrapper">
              <select 
                id="inv-type"
                value={type} 
                onChange={e => setType(e.target.value as 'container' | 'individual')}
              >
                <option value="container">Container (e.g. Wine/Liquor - track parts / ml left)</option>
                <option value="individual">Individual units (e.g. Beer Cans - track unit count)</option>
              </select>
            </div>
            <p className="help-text">
              Containers are used to track multiple drinks from the same bottle. Individual units are consumed whole.
            </p>
          </div>

          <div className="side-by-side" style={{ display: 'flex', gap: 'var(--spacing-md)' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label htmlFor="inv-volume">Unit Vol (ml)</label>
              <input 
                id="inv-volume"
                type="number" 
                min="1"
                max="10000"
                value={unitVolume} 
                onChange={e => setUnitVolume(e.target.value === '' ? '' : Number(e.target.value))} 
                placeholder="ml"
                required 
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label htmlFor="inv-abv">ABV (%)</label>
              <input 
                id="inv-abv"
                type="number" 
                step="0.1"
                min="0"
                max="100"
                value={abv} 
                onChange={e => setAbv(e.target.value === '' ? '' : Number(e.target.value))} 
                placeholder="%"
                required 
              />
            </div>
          </div>

          <div className="side-by-side" style={{ display: 'flex', gap: 'var(--spacing-md)' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label htmlFor="inv-qty">Initial Qty</label>
              <input 
                id="inv-qty"
                type="number" 
                min="0"
                value={quantity} 
                onChange={e => setQuantity(e.target.value === '' ? '' : Number(e.target.value))} 
                placeholder="Quantity"
                required 
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label htmlFor="inv-calories">Kcal (optional)</label>
              <input 
                id="inv-calories"
                type="number" 
                min="0"
                value={calories} 
                onChange={e => setCalories(e.target.value === '' ? '' : Number(e.target.value))} 
                placeholder="kcal"
              />
            </div>
          </div>

          <div className="form-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--spacing-sm)', marginTop: 'var(--spacing-md)' }}>
            <button type="button" onClick={resetForm}>Cancel</button>
            <button type="submit" className="primary-btn">{editingItemId ? 'Save Changes' : 'Add Item'}</button>
          </div>
        </form>
      )}

      <div className="inventory-list" style={{ marginTop: 'var(--spacing-md)' }}>
        {inventory.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 'var(--spacing-xl)', opacity: 0.6 }}>
            <p>Your inventory is empty. Click "+ Add Stock" to start tracking what you have at home.</p>
          </div>
        ) : (
          inventory.map(item => {
            const hasOpen = item.type === 'container' && item.remainingVolume < item.unitVolume && item.remainingVolume > 0;
            const fillPercentage = item.type === 'container' ? (item.remainingVolume / item.unitVolume) * 100 : 100;
            
            return (
              <div key={item.id} className="card inventory-item-card" style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{item.name}</h3>
                    <p className="help-text" style={{ margin: 0 }}>
                      {item.unitVolume}ml • {item.abv}% ABV • {item.calories ? `${item.calories} kcal/unit` : 'no kcal'}
                    </p>
                  </div>
                  
                  <div style={{ display: 'flex', gap: 'var(--spacing-xs)' }}>
                    <button 
                      type="button" 
                      style={{ padding: '4px 8px', fontSize: '0.8rem', opacity: 0.8 }} 
                      onClick={() => startEdit(item)}
                    >
                      ✎
                    </button>
                    <button 
                      type="button" 
                      style={{ padding: '4px 8px', fontSize: '0.8rem', opacity: 0.8, color: 'var(--error)' }} 
                      onClick={() => {
                        if (confirm(`Remove ${item.name} from inventory?`)) {
                          removeInventoryItem(item.id);
                        }
                      }}
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {item.type === 'container' ? (
                  <div className="container-status-wrapper" style={{ marginTop: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '4px' }}>
                      <span>
                        {hasOpen 
                          ? `Active Container: ${item.remainingVolume}ml / ${item.unitVolume}ml left` 
                          : item.quantity > 0 
                            ? 'Ready to open first bottle'
                            : 'All bottles empty'
                        }
                      </span>
                      <strong>
                        {item.quantity} {item.quantity === 1 ? 'bottle' : 'bottles'} unopened
                      </strong>
                    </div>
                    {item.quantity > 0 || hasOpen ? (
                      <div className="progress-bar-bg" style={{ height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                        <div 
                          className="progress-bar-fill" 
                          style={{ 
                            height: '100%', 
                            width: `${fillPercentage}%`, 
                            background: fillPercentage < 25 ? 'var(--error)' : fillPercentage < 60 ? 'var(--warning)' : 'var(--safe)',
                            transition: 'var(--transition)'
                          }} 
                        />
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="individual-status-wrapper" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                    <span>Stock count:</span>
                    <strong style={{ fontSize: '1.1rem', color: item.quantity === 0 ? 'var(--error)' : 'inherit' }}>
                      {item.quantity} {item.quantity === 1 ? 'unit' : 'units'} left
                    </strong>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--spacing-xs)', paddingTop: 'var(--spacing-xs)', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <span className="help-text" style={{ margin: 0 }}>
                    Quick Adjust Stock Quantity:
                  </span>
                  <div style={{ display: 'flex', gap: 'var(--spacing-sm)', alignItems: 'center' }}>
                    <button 
                      type="button" 
                      onClick={() => adjustQuantity(item.id, -1)}
                      disabled={item.quantity <= 0}
                      style={{ padding: '4px 12px', background: 'rgba(255,255,255,0.05)' }}
                    >
                      -1
                    </button>
                    <span style={{ fontWeight: 'bold', minWidth: '20px', textAlign: 'center' }}>{item.quantity}</span>
                    <button 
                      type="button" 
                      onClick={() => adjustQuantity(item.id, 1)}
                      style={{ padding: '4px 12px', background: 'rgba(255,255,255,0.05)' }}
                    >
                      +1
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default InventoryManager;
