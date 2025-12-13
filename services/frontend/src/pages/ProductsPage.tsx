import React, { useCallback, useEffect, useState } from 'react';
import api from '../services/api';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Modal } from '../components/Modal';
import { AxiosError } from 'axios';

interface ProductParameter {
  parameterId: string;
  name?: string;
  values?: unknown[] | string | null;
  valuesIds?: unknown[] | null;
  rangeValue?: unknown | null;
}

type RawProductParam = {
  id?: string | number;
  name?: string;
  values?: Array<string | { name?: string }> | string[];
  valuesIds?: Array<string | number> | null;
  rangeValue?: unknown | null;
};

type RawProduct = {
  id?: string;
  name?: string;
  brand?: string;
  manufacturerCode?: string;
  ean?: string;
  publication?: { status?: string };
  isAiCoCreated?: boolean;
  parameters?: RawProductParam[];
};

interface Product {
  id: string;
  allegroProductId: string;
  name?: string;
  brand?: string;
  manufacturerCode?: string;
  ean?: string;
  publicationStatus?: string;
  isAiCoCreated?: boolean;
  marketedBeforeGPSR?: boolean | null;
  rawData?: { product?: RawProduct; marketedBeforeGPSRObligation?: boolean; [key: string]: unknown };
  parameters?: ProductParameter[];
  createdAt?: string;
  updatedAt?: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const defaultPagination: Pagination = { page: 1, limit: 20, total: 0, totalPages: 1 };

const ProductsPage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [pagination, setPagination] = useState<Pagination>(defaultPagination);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Product | null>(null);
  const [form, setForm] = useState({
    allegroProductId: '',
    name: '',
    brand: '',
    manufacturerCode: '',
    ean: '',
    publicationStatus: '',
    isAiCoCreated: false,
    marketedBeforeGPSR: false,
    rawDataText: '',
    parametersText: '',
  });

  const loadProducts = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const res = await api.get('/allegro/products', {
        params: { page, limit: pagination.limit, search },
      });
      const data = res.data?.data;
      setProducts(data?.items || []);
      setPagination(data?.pagination || defaultPagination);
      setError(null);
    } catch (err) {
      console.error('Failed to load products', err);
      const axiosErr = err as AxiosError & { serviceErrorMessage?: string };
      setError(axiosErr.serviceErrorMessage || axiosErr.message || 'Failed to load products');
    } finally {
      setLoading(false);
    }
  }, [pagination.limit, search]);

  useEffect(() => {
    loadProducts(1);
  }, [loadProducts]);

  const openCreate = () => {
    setSelected(null);
    setForm({
      allegroProductId: '',
      name: '',
      brand: '',
      manufacturerCode: '',
      ean: '',
      publicationStatus: '',
      isAiCoCreated: false,
      marketedBeforeGPSR: false,
      rawDataText: JSON.stringify({}, null, 2),
      parametersText: '',
    });
    setModalOpen(true);
  };

  const applyRawToForm = (raw: { product?: RawProduct; marketedBeforeGPSRObligation?: boolean; [key: string]: unknown }) => {
    if (!raw || !raw.product) return;
    const product = raw.product;
    const params = Array.isArray(product.parameters) ? product.parameters : [];
    const findParamVal = (id: string, name?: string) => {
      const p = params.find((param: RawProductParam) => param.id?.toString() === id || param.name === name);
      if (!p?.values || p.values.length === 0) return undefined;
      const v = p.values[0] as string | { name?: string };
      return typeof v === 'string' ? v : v?.name;
    };

    setForm((prev) => ({
      ...prev,
      allegroProductId: product.id || prev.allegroProductId,
      name: product.name || prev.name,
      brand: findParamVal('248811', 'Značka') || product.brand || prev.brand,
      manufacturerCode: findParamVal('224017', 'Kód výrobce') || product.manufacturerCode || prev.manufacturerCode,
      ean: findParamVal('225693', 'EAN (GTIN)') || product.ean || prev.ean,
      publicationStatus: product.publication?.status || prev.publicationStatus,
      isAiCoCreated: product.isAiCoCreated ?? prev.isAiCoCreated,
      marketedBeforeGPSR: raw.marketedBeforeGPSRObligation ?? prev.marketedBeforeGPSR,
      rawDataText: JSON.stringify(raw, null, 2),
      parametersText: params.length > 0 ? JSON.stringify(params, null, 2) : '',
    }));
  };

  const openEdit = async (product: Product) => {
    setError(null);
    setDetailLoading(true);
    setModalOpen(true);
    try {
      const res = await api.get(`/allegro/products/${product.id}`);
      const body = res.data as any;
      const full: Product = (body && body.data) || body || product;
      setSelected(full);
      setForm({
        allegroProductId: full.allegroProductId || product.allegroProductId || '',
        name: full.name || product.name || '',
        brand: full.brand || product.brand || '',
        manufacturerCode: full.manufacturerCode || product.manufacturerCode || '',
        ean: full.ean || product.ean || '',
        publicationStatus: full.publicationStatus || product.publicationStatus || '',
        isAiCoCreated: !!(full.isAiCoCreated ?? product.isAiCoCreated),
        marketedBeforeGPSR: full.marketedBeforeGPSR ?? product.marketedBeforeGPSR ?? false,
        rawDataText: JSON.stringify(full.rawData || product.rawData || {}, null, 2),
        parametersText:
          (full.parameters && full.parameters.length > 0
            ? JSON.stringify(full.parameters, null, 2)
            : product.parameters && product.parameters.length > 0
              ? JSON.stringify(product.parameters, null, 2)
              : ''),
      });
      if (full.rawData) {
        applyRawToForm(full.rawData as any);
      }
    } catch (err) {
      console.error('Failed to load product detail', err);
      const axiosErr = err as AxiosError & { serviceErrorMessage?: string };
      setError(axiosErr.serviceErrorMessage || axiosErr.message || 'Failed to load product details');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this product?')) return;
    try {
      await api.delete(`/allegro/products/${id}`);
      await loadProducts(pagination.page);
    } catch (err) {
      console.error('Failed to delete product', err);
      const axiosErr = err as AxiosError & { serviceErrorMessage?: string };
      setError(axiosErr.serviceErrorMessage || axiosErr.message || 'Failed to delete product');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      let rawDataParsed: Record<string, unknown> | { product?: RawProduct } = {};
      let parametersParsed: ProductParameter[] | undefined;

      if (form.rawDataText) {
        rawDataParsed = JSON.parse(form.rawDataText);
      }
      if (form.parametersText.trim()) {
        const parsed = JSON.parse(form.parametersText);
        parametersParsed = Array.isArray(parsed) ? (parsed as ProductParameter[]) : [];
      }

      const payload: {
        allegroProductId?: string;
        name?: string;
        brand?: string;
        manufacturerCode?: string;
        ean?: string;
        publicationStatus?: string;
        isAiCoCreated?: boolean;
        marketedBeforeGPSR?: boolean;
        rawData?: Record<string, unknown> | { product?: RawProduct };
        parameters?: ProductParameter[];
      } = {
        allegroProductId: form.allegroProductId || undefined,
        name: form.name || undefined,
        brand: form.brand || undefined,
        manufacturerCode: form.manufacturerCode || undefined,
        ean: form.ean || undefined,
        publicationStatus: form.publicationStatus || undefined,
        isAiCoCreated: !!form.isAiCoCreated,
        marketedBeforeGPSR: form.marketedBeforeGPSR,
        rawData: rawDataParsed,
        parameters: parametersParsed,
      };

      if (selected) {
        await api.put(`/allegro/products/${selected.id}`, payload);
      } else {
        await api.post('/allegro/products', payload);
      }

      setModalOpen(false);
      await loadProducts(pagination.page);
    } catch (err) {
      console.error('Failed to save product', err);
      if (err instanceof SyntaxError) {
        setError('Invalid JSON in raw data or parameters');
      } else {
        const axiosErr = err as AxiosError & { serviceErrorMessage?: string };
        setError(axiosErr.serviceErrorMessage || axiosErr.message || 'Failed to save product');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
        <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Products</h2>
            <p className="text-gray-600">Manage Allegro products extracted from offers</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => loadProducts(pagination.page)} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </Button>
          <Button onClick={openCreate}>Add Product</Button>
        </div>
      </div>

      <Card>
        <div className="flex items-center gap-3 mb-4">
          <Input
            label="Search"
            placeholder="Name, brand, EAN, Allegro product ID"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button variant="secondary" onClick={() => loadProducts(1)} disabled={loading}>
            Apply
          </Button>
        </div>

        {error && <div className="text-red-600 text-sm mb-3">{error}</div>}

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Allegro Product ID</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Name</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Brand</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Manufacturer Code</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">EAN</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Status</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Updated</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Params</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {products.map((product) => (
                <tr key={product.id}>
                  <td className="px-4 py-2 text-sm">{product.allegroProductId}</td>
                  <td className="px-4 py-2 text-sm">{product.name || '—'}</td>
                  <td className="px-4 py-2 text-sm">{product.brand || '—'}</td>
                  <td className="px-4 py-2 text-sm">{product.manufacturerCode || '—'}</td>
                  <td className="px-4 py-2 text-sm">{product.ean || '—'}</td>
                  <td className="px-4 py-2 text-sm">{product.publicationStatus || '—'}</td>
                  <td className="px-4 py-2 text-sm">
                    {product.updatedAt ? new Date(product.updatedAt).toLocaleString() : '—'}
                  </td>
                  <td className="px-4 py-2 text-sm">
                    {product.parameters && product.parameters.length > 0 ? product.parameters.length : '0'}
                  </td>
                  <td className="px-4 py-2 text-right space-x-2">
                    <Button variant="secondary" size="small" onClick={() => openEdit(product)}>
                      Edit
                    </Button>
                    <Button variant="secondary" size="small" onClick={() => handleDelete(product.id)}>
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
              {products.length === 0 && (
                <tr>
                  <td className="px-4 py-4 text-center text-sm text-gray-500" colSpan={7}>
                    {loading ? 'Loading products...' : 'No products found'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between mt-4">
          <div className="text-sm text-gray-600">
            Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
          </div>
          <div className="space-x-2">
            <Button
              variant="secondary"
              size="small"
              disabled={pagination.page <= 1 || loading}
              onClick={() => loadProducts(pagination.page - 1)}
            >
              Prev
            </Button>
            <Button
              variant="secondary"
              size="small"
              disabled={pagination.page >= pagination.totalPages || loading}
              onClick={() => loadProducts(pagination.page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </Card>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={selected ? 'Edit Product' : 'Add Product'}>
        <div className="space-y-3">
          {detailLoading && selected && (
            <div className="text-sm text-gray-600">Loading product details...</div>
          )}
          {selected && !detailLoading && (
            <div className="p-2 bg-gray-50 rounded border text-sm grid grid-cols-2 gap-2">
              <div><span className="font-medium">Allegro Product ID:</span> {selected.allegroProductId || '—'}</div>
              <div><span className="font-medium">Publication:</span> {selected.publicationStatus || '—'}</div>
              <div><span className="font-medium">Brand:</span> {selected.brand || '—'}</div>
              <div><span className="font-medium">Manufacturer Code:</span> {selected.manufacturerCode || '—'}</div>
              <div><span className="font-medium">EAN:</span> {selected.ean || '—'}</div>
              <div><span className="font-medium">AI Co-Created:</span> {selected.isAiCoCreated ? 'Yes' : 'No'}</div>
              <div><span className="font-medium">Marketed before GPSR:</span> {selected.marketedBeforeGPSR ? 'Yes' : 'No'}</div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Allegro Product ID"
              value={form.allegroProductId}
              onChange={(e) => setForm({ ...form, allegroProductId: e.target.value })}
            />
            <Input
              label="Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <Input
              label="Brand"
              value={form.brand}
              onChange={(e) => setForm({ ...form, brand: e.target.value })}
            />
            <Input
              label="Manufacturer Code"
              value={form.manufacturerCode}
              onChange={(e) => setForm({ ...form, manufacturerCode: e.target.value })}
            />
            <Input label="EAN" value={form.ean} onChange={(e) => setForm({ ...form, ean: e.target.value })} />
            <Input
              label="Publication Status"
              value={form.publicationStatus}
              onChange={(e) => setForm({ ...form, publicationStatus: e.target.value })}
            />
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isAiCoCreated}
                onChange={(e) => setForm({ ...form, isAiCoCreated: e.target.checked })}
              />
              AI Co-Created
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!form.marketedBeforeGPSR}
                onChange={(e) => setForm({ ...form, marketedBeforeGPSR: e.target.checked })}
              />
              Marketed before GPSR
            </label>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700">Raw Data (JSON)</label>
            <textarea
              className="mt-1 w-full border rounded p-2 font-mono text-sm"
              rows={8}
              value={form.rawDataText}
              onChange={(e) => setForm({ ...form, rawDataText: e.target.value })}
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700">Parameters (JSON array, optional)</label>
            <textarea
              className="mt-1 w-full border rounded p-2 font-mono text-sm"
              rows={6}
              placeholder='[{"parameterId":"225693","name":"EAN (GTIN)","values":["4650097695809"]}]'
              value={form.parametersText}
              onChange={(e) => setForm({ ...form, parametersText: e.target.value })}
            />
          </div>

          {selected && selected.parameters && selected.parameters.length > 0 && (
            <div className="border rounded p-2 max-h-48 overflow-auto text-sm space-y-1 bg-gray-50">
              <div className="font-semibold">Existing parameters</div>
              {selected.parameters.map((param) => {
                const renderValues = () => {
                  if (!param.values) return '—';
                  if (Array.isArray(param.values)) {
                    return (param.values as unknown[]).map((v) => (typeof v === 'string' ? v : JSON.stringify(v))).join(', ');
                  }
                  return typeof param.values === 'string' ? param.values : JSON.stringify(param.values);
                };
                return (
                  <div key={`${param.parameterId}-${param.name || ''}`}>
                    <span className="font-medium">{param.name || param.parameterId}:</span>{' '}
                    <span>{renderValues()}</span>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex justify-end gap-2">
            {selected?.rawData && !detailLoading && (
              <Button
                variant="secondary"
                onClick={() => selected.rawData && applyRawToForm(selected.rawData)}
                disabled={saving}
              >
                Refresh from raw
              </Button>
            )}
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default ProductsPage;

